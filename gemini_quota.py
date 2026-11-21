"""Gemini retry hints and non-secret checkpoints for a paused analysis."""
from copy import deepcopy
from datetime import datetime, time, timedelta
from email.utils import parsedate_to_datetime
import hashlib
import json
import math
import os
import re
from zoneinfo import ZoneInfo

from jsonfile import write_json_atomic

WAIT_FILE = '.gemini_quota_wait.json'
ANALYSIS_FILE = '.gemini_analysis.json'
WAIT_EXIT = 75
RESUME_OPTIONS = (
    'CLIP_SELECTION_MODE', 'CLIP_LAYOUT_PRESET', 'AUTO_LAYOUT', 'SPLIT_LAYOUT',
    'PANEL_LAYOUT', 'SCREENCAST_LAYOUT', 'CLIP_TARGET_MIN', 'CLIP_TARGET_MAX',
    'CLIP_MIN_SECONDS', 'CLIP_MAX_SECONDS', 'AUTO_CAPTIONS', 'AUTO_HOOK',
    'AUTO_HOOK_STYLE', 'AUTO_HOOK_SECONDS', 'GEMINI_MODEL', 'LLM_SCORE_BATCH',
    'VISION_SEGMENT_SECONDS', 'VISION_MAX_SEGMENTS',
)


def key_fingerprint(key):
    return hashlib.sha256(key.encode()).hexdigest() if key else None


def next_daily_reset(now=None):
    pacific = ZoneInfo('America/Los_Angeles')
    current = datetime.now(pacific) if now is None else datetime.fromtimestamp(now, pacific)
    return datetime.combine(current.date() + timedelta(days=1), time(), pacific).timestamp()


class DailyQuotaReached(Exception):
    def __init__(self, resume_at):
        super().__init__('Gemini daily quota reached.')
        self.resume_at = resume_at


def _seconds(value):
    try:
        seconds = float(str(value).rstrip('s'))
        return seconds if math.isfinite(seconds) and seconds > 0 else None
    except (TypeError, ValueError):
        return None


def rate_limit(exc):
    """Return (daily, retry seconds) for a Gemini rate error, otherwise None."""
    if getattr(exc, 'code', None) != 429 and getattr(exc, 'status', None) != 'RESOURCE_EXHAUSTED':
        return None
    payload = getattr(exc, 'details', None)
    if isinstance(payload, dict):
        error = payload.get('error', payload)
        payload = error.get('details', []) if isinstance(error, dict) else []
    details = [item for item in payload if isinstance(item, dict)] if isinstance(payload, list) else []
    hints = []
    header = getattr(getattr(exc, 'response', None), 'headers', {}) or {}
    retry_after = header.get('Retry-After')
    delay = _seconds(retry_after)
    if retry_after and delay is None:
        try:
            deadline = parsedate_to_datetime(retry_after)
            delay = _seconds((deadline - datetime.now(deadline.tzinfo)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            pass
    hints.append(delay)
    quotas = []
    for item in details:
        hints.append(_seconds(item.get('retryDelay')))
        violations = item.get('violations')
        if isinstance(violations, list):
            quotas.extend(v for v in violations if isinstance(v, dict))
    message = str(getattr(exc, 'message', '') or '')
    for match in re.finditer(r'retry (?:in|after)\s+(\d+(?:\.\d+)?)\s*s', message, re.I):
        hints.append(_seconds(match[1]))
    # A zero allowance (unsupported model/tier) will not replenish at midnight.
    if any(str(v.get('quotaValue')) == '0' for v in quotas) or re.search(r'\blimit:\s*0\b', message):
        return None
    evidence = [message] + [str(v.get(k, '')) for v in quotas for k in ('quotaId', 'quotaMetric')]
    quota_text = re.sub(r'[^a-z]', '', ' '.join(evidence).lower())
    daily = 'perday' in quota_text or 'dailyquota' in quota_text
    return daily, max((hint for hint in hints if hint is not None), default=60.0)


def _read_object(path):
    try:
        with open(path, encoding='utf-8') as stream:
            value = json.load(stream)
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def read_wait(directory):
    wait = _read_object(os.path.join(directory, WAIT_FILE))
    if (isinstance(wait.get('resume_at'), (float, int)) and math.isfinite(wait['resume_at'])
            and isinstance(wait.get('paused_at', 0), (float, int))):
        return wait
    return None


class AnalysisCheckpoint:
    """Reuse completed model requests after a daily-quota pause."""

    def __init__(self, directory):
        self.path = os.path.join(directory, ANALYSIS_FILE)
        self.results = _read_object(self.path)

    def call(self, identity, request):
        key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        if key in self.results:
            return deepcopy(self.results[key])
        result = request()
        self.results[key] = deepcopy(result)
        write_json_atomic(self.path, self.results)
        return result
