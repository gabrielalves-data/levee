'use strict';

// §9 item 1 — pins localGuard's actual behavior: reject a non-loopback Host,
// reject an untrusted Origin, reject a wrong/absent token; accept a valid
// loopback request with the correct token. NOTE: the omitted Origin and the
// opaque 'null' Origin (sent by the packaged app's file:// renderer) are
// deliberately ALLOWED THROUGH to the token check — see the comment in
// localGuard.js — the per-launch token is the real gate for those cases, not
// the Origin header. This test pins that documented behavior.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { localGuard, setLaunchToken } = require('./localGuard');

const TEST_TOKEN = 'a'.repeat(64);

function run(headers) {
  const req = { headers };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;
  localGuard(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

describe('localGuard', () => {
  beforeEach(() => {
    setLaunchToken(TEST_TOKEN);
  });

  it('rejects a non-loopback Host', () => {
    const { res, nextCalled } = run({ host: 'evil.com', 'x-levee-token': TEST_TOKEN });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  });

  it('rejects an untrusted Origin even with a correct token', () => {
    const { res, nextCalled } = run({ host: '127.0.0.1', origin: 'https://evil.com', 'x-levee-token': TEST_TOKEN });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  });

  it('rejects a wrong token', () => {
    const { res, nextCalled } = run({ host: '127.0.0.1', 'x-levee-token': 'wrong' });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  it('rejects an absent token', () => {
    const { res, nextCalled } = run({ host: '127.0.0.1' });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  it("does not let the opaque 'null' Origin bypass the token check", () => {
    const { res, nextCalled } = run({ host: '127.0.0.1', origin: 'null', 'x-levee-token': 'wrong' });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  it('accepts a valid loopback request with the correct token and no Origin', () => {
    const { nextCalled } = run({ host: '127.0.0.1', 'x-levee-token': TEST_TOKEN });
    assert.equal(nextCalled, true);
  });

  it("accepts the opaque 'null' Origin paired with the correct token (packaged app's file:// renderer)", () => {
    const { nextCalled } = run({ host: '127.0.0.1', origin: 'null', 'x-levee-token': TEST_TOKEN });
    assert.equal(nextCalled, true);
  });

  it('accepts a loopback Origin with a port (dev Vite) and the correct token', () => {
    const { nextCalled } = run({ host: 'localhost:3001', origin: 'http://localhost:5173', 'x-levee-token': TEST_TOKEN });
    assert.equal(nextCalled, true);
  });
});
