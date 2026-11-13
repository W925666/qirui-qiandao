/**
 * 奇瑞签到：自动获取当前登录凭据（Loon 响应脚本）。
 * 只读取签到状态接口的请求头和账号标识，不修改请求或响应，不发送网络请求。
 * 凭据仅写入本机 fmz200_chery_account；代码与远程仓库不包含个人凭据。
 */
(function () {
  'use strict';
  var KEY = 'fmz200_chery_account';

  function capture(request, response, store) {
    if (!request || !/^https:\/\/mobile-consumer-sapp\.chery\.cn\/web\/task\/record\/sign-in\/daily(?:\?|$)/.test(request.url || '')) {
      return { saved: false, reason: 'not-target' };
    }
    var headers = request.headers || {}, authorization = '';
    Object.keys(headers).forEach(function (name) {
      if (name.toLowerCase() === 'authorization') authorization = String(headers[name]);
    });
    if (!/^Bearer\s+\S+$/i.test(authorization)) return { saved: false, reason: 'missing-bearer' };
    var token = authorization.replace(/^Bearer\s+/i, '').trim();
    var httpStatus = Number(response && (response.status || response.statusCode));
    if (httpStatus !== 200) return { saved: false, reason: 'http-error' };
    var body;
    try { body = JSON.parse(response.body); }
    catch (_) { return { saved: false, reason: 'invalid-response' }; }
    if (Number(body.status) !== 200 || !body.data || typeof body.data.todayCompleted !== 'boolean') return { saved: false, reason: 'invalid-status' };
    var rawAccountId = body.data.accountId;
    var accountId = rawAccountId === undefined || rawAccountId === null ? '' : String(rawAccountId);
    var accounts, previous = store.read(KEY);
    try { accounts = previous ? JSON.parse(previous) : []; }
    catch (_) { return { saved: false, reason: 'invalid-storage' }; }
    if (!Array.isArray(accounts)) return { saved: false, reason: 'invalid-storage' };
    var seen = Object.create(null), unique = [];
    accounts.forEach(function (item) {
      if (!item || typeof item.access_token !== 'string') return;
      var t = item.access_token.replace(/^Bearer\s+/i, '').trim();
      if (!t || seen[t]) return;
      seen[t] = true;
      unique.push(Object.assign({}, item, { access_token: t }));
    });
    var target = -1;
    unique.forEach(function (item, index) {
      if ((accountId && String(item.accountId || '') === accountId) || item.access_token === token) target = index;
    });
    // The current endpoint can return accountId:null. Maintain one rolling slot
    // for such captures instead of appending every refreshed token indefinitely.
    if (target < 0 && !accountId) unique.forEach(function (item, index) {
      if (!item.accountId && item.captureSource === 'qirui-qiandao') target = index;
    });
    if (target < 0 && unique.length === 1 && !unique[0].accountId) target = 0;
    var old = target >= 0 ? unique[target] : {};
    var item = Object.assign({}, old, {
      access_token: token,
      accountId: accountId,
      displayName: old.displayName || ('账号' + (target >= 0 ? target + 1 : unique.length + 1))
    });
    if (!accountId) { delete item.accountId; item.captureSource = 'qirui-qiandao'; }
    var changed = old.access_token !== token || String(old.accountId || '') !== accountId || unique.length !== accounts.length;
    if (!changed) return { saved: false, reason: 'unchanged' };
    if (target >= 0) unique[target] = item;
    else unique.push(item);
    if (!store.write(JSON.stringify(unique), KEY)) return { saved: false, reason: 'write-failed' };
    return { saved: true, accounts: unique.length };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { capture: capture };
    return;
  }
  try {
    var result = capture(typeof $request !== 'undefined' ? $request : null, typeof $response !== 'undefined' ? $response : null, $persistentStore);
    if (result.saved) {
      console.log('奇瑞签到：登录凭据已更新到本机；当前账号数量 ' + result.accounts + '。未输出凭据。');
      if (typeof $notification !== 'undefined') $notification.post('奇瑞签到', '登录凭据已自动获取', '无需手填；凭据只保存在当前设备，可运行签到任务。');
    } else if (result.reason === 'invalid-storage' || result.reason === 'write-failed') {
      console.log('奇瑞签到：本地配置无法读取或保存，原配置未覆盖；请检查脚本存储。');
    }
  } catch (_) { console.log('奇瑞签到：获取凭据失败，原请求和响应保持不变。'); }
  finally { if (typeof $done !== 'undefined') $done({}); }
})();
