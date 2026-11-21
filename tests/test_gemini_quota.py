import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import gemini_quota as quota


class FakeLimit(Exception):
    code = 429

    def __init__(self, quota_id, delay='17s'):
        self.details = {'error': {'details': [
            {'violations': [{'quotaId': quota_id, 'quotaValue': '15'}]},
            {'retryDelay': delay},
        ]}}


def test_distinguishes_request_and_token_minute_limits_from_daily_quota():
    assert quota.rate_limit(FakeLimit('GenerateRequestsPerMinutePerProject')) == (False, 17)
    assert quota.rate_limit(FakeLimit('GenerateContentInputTokensPerMinute')) == (False, 17)
    assert quota.rate_limit(FakeLimit('GenerateRequestsPerDayPerProject-FreeTier')) == (True, 17)
    assert quota.rate_limit(SimpleNamespace(code=429, message='Daily quota reached')) == (True, 60)
    assert quota.rate_limit(ValueError('unrelated 429')) is None


@pytest.mark.parametrize('month,utc_hour', [(11, 8), (7, 7)])
def test_next_daily_reset_uses_pacific_time(month, utc_hour):
    now = datetime(2026, month, 21, 6, tzinfo=timezone.utc)
    assert datetime.fromtimestamp(quota.next_daily_reset(now.timestamp()), timezone.utc) == datetime(
        2026, month, 21, utc_hour, tzinfo=timezone.utc)


def test_successful_stages_survive_a_pause_and_keep_original_timecodes(tmp_path):
    stage = quota.AnalysisCheckpoint(tmp_path)
    result = stage.call(['video', 1], lambda: ([{'start': 3}], None))
    result[0][0]['start'] += 200  # offsets applied downstream must not mutate saved results

    def unavailable():
        raise quota.DailyQuotaReached(1000)

    with pytest.raises(quota.DailyQuotaReached):
        stage.call(['video', 2], unavailable)
    stage = quota.AnalysisCheckpoint(tmp_path)
    assert stage.call(['video', 1], lambda: pytest.fail('already processed')) == [[{'start': 3}], None]
    assert stage.call(['video', 2], lambda: ([{'start': 5}], None))[0] == [{'start': 5}]


def test_minute_limit_retries_the_exact_request_after_waiting(monkeypatch):
    main = pytest.importorskip('main')
    monkeypatch.setattr(main.llm_backend, 'active', lambda: False)
    monkeypatch.setattr(main.gemini_worker, 'raise_if_blocked', lambda _: None)
    monkeypatch.setattr(main.gemini_worker, '_calculate_cost_analysis', lambda *_: None)
    attempts = []
    sleeps = []
    monkeypatch.setattr(main.time, 'sleep', sleeps.append)

    def generate(**params):
        attempts.append(params['contents'])
        if len(attempts) == 1:
            raise FakeLimit('RequestsPerMinute')
        return SimpleNamespace(parsed={'windows': []})

    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    assert main._run_gemini_stage(client, 'test-model', 'same prompt', main.gemini_worker.ScoreResponse) == ({'windows': []}, None)
    assert attempts == ['same prompt', 'same prompt']
    assert sleeps == [17]


def test_daily_wait_requeues_without_saving_the_key_and_accepts_only_original_key(monkeypatch, tmp_path):
    app = pytest.importorskip('app')
    monkeypatch.setattr(app, 'BILLING_ENABLED', False)
    monkeypatch.setattr(app, '_draining', False)
    monkeypatch.setattr(app, '_read_manifest', lambda _: {'priority': 3})
    seen = []
    monkeypatch.setattr(app, '_enqueue_job', lambda *args: seen.append(args))
    key = 'original-test-key'
    wait = {'resume_at': 0, 'key_id': quota.key_fingerprint(key)}
    job = {'env': {}, 'logs': []}
    monkeypatch.setitem(app.jobs, 'paused', job)

    async def run():
        app._schedule_gemini_resume('paused', job, wait)
        assert app._gemini_wait_status(job)['needs_key'] is True
        assert not seen
        with pytest.raises(app.HTTPException) as wrong:
            await app.attach_gemini_resume_key('paused', SimpleNamespace(headers={'X-Gemini-Key': 'wrong-test-key'}))
        assert wrong.value.status_code == 409
        state = await app.attach_gemini_resume_key('paused', SimpleNamespace(headers={'X-Gemini-Key': key}))
        assert state['needs_key'] is False
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert seen == [('paused', 3)]
        assert 'gemini_wait' not in job

    asyncio.run(run())


def test_daily_exit_releases_slot_and_requeues_without_terminal_delivery(monkeypatch, tmp_path):
    app = pytest.importorskip('app')
    key = 'job-test-key'
    job = {'output_dir': str(tmp_path), 'env': {'GEMINI_API_KEY': key}, 'cmd': ['main.py'],
           'status': 'processing', 'logs': []}
    monkeypatch.setitem(app.jobs, 'job', job)
    monkeypatch.setattr(app, 'BILLING_ENABLED', False)
    monkeypatch.setattr(app, '_stopping', False)
    monkeypatch.setattr(app, '_draining', False)
    monkeypatch.setattr(app, '_read_manifest', lambda _: {'priority': 2})
    seen = []
    monkeypatch.setattr(app, '_release_slot', lambda ident: seen.append(('released', ident)))
    monkeypatch.setattr(app, '_enqueue_job', lambda ident, priority: seen.append(('queued', ident)))
    monkeypatch.setattr(app, '_begin_delivery', lambda *_: pytest.fail('paused job must not be delivered'))
    monkeypatch.setattr(app, '_finish_job', lambda *_: pytest.fail('paused job must not be marked failed'))

    async def no_proxy():
        return False

    async def paused_child(ident, cmd, env, tick=None):
        assert env['GEMINI_QUOTA_RESUME'] == '1'
        quota.write_json_atomic(tmp_path / quota.WAIT_FILE, {
            'resume_at': 0, 'key_id': quota.key_fingerprint(key)})
        return quota.WAIT_EXIT

    monkeypatch.setattr(app, '_paid_proxy_budget_exceeded', no_proxy)
    monkeypatch.setattr(app, '_run_main', paused_child)

    async def run():
        await app.run_job_wrapper('job')
        assert seen == [('released', 'job')]
        assert job['status'] == 'queued'
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert seen == [('released', 'job'), ('queued', 'job')]

    asyncio.run(run())
