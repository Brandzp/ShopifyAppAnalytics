(function () {
  // Client-readable cookie names. These are DISTINCT from the server-side
  // `aff_click_id` cookie set by /api/affiliate-portal/redirect, which is
  // HttpOnly and therefore invisible to this script. We keep our own
  // first-party, JS-readable cookies so Safari ITP users (which prunes
  // localStorage from cross-site contexts after ~7 days and blocks it in some
  // modes) still carry attribution through to checkout.
  var COOKIE_REF = 'affiliate_ref';
  var COOKIE_CLICK_ID = 'affiliate_click_id';
  var COOKIE_MAX_AGE_DAYS = 30;

  function setCookie(name, value) {
    try {
      var expires = new Date(Date.now() + COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie =
        name + '=' + encodeURIComponent(value) +
        '; expires=' + expires +
        '; path=/; SameSite=Lax; Secure';
    } catch (error) {
      console.warn('Affiliate tracking cookie write failed', error);
    }
  }

  function getCookie(name) {
    try {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (error) {
      console.warn('Affiliate tracking cookie read failed', error);
      return null;
    }
  }

  var params = new URLSearchParams(window.location.search);
  var ref = params.get('ref');
  var clickId = params.get('agent_click_id');

  // WRITE path: persist incoming attribution to BOTH localStorage and a
  // first-party cookie so it survives ITP localStorage pruning.
  if (ref || clickId) {
    try {
      if (ref) localStorage.setItem('affiliate_ref', ref);
      if (clickId) localStorage.setItem('affiliate_click_id', clickId);
    } catch (error) {
      console.warn('Affiliate tracking storage failed', error);
    }
    if (ref) setCookie(COOKIE_REF, ref);
    if (clickId) setCookie(COOKIE_CLICK_ID, clickId);
  }

  // READ path: cookie FIRST (survives ITP), then localStorage as fallback.
  function readStored(cookieName, storageKey) {
    var fromCookie = getCookie(cookieName);
    if (fromCookie) return fromCookie;
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  var savedRef = ref || readStored(COOKIE_REF, 'affiliate_ref');
  var savedClickId = clickId || readStored(COOKIE_CLICK_ID, 'affiliate_click_id');
  if (!savedRef && !savedClickId) return;

  var payload = {
    attributes: {
      ref: savedRef || '',
      agent_click_id: savedClickId || ''
    },
    note: [savedRef ? 'ref:' + savedRef : '', savedClickId ? 'agent_click_id:' + savedClickId : ''].filter(Boolean).join(' | ')
  };

  fetch('/cart/update.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  }).catch(function (error) {
    console.warn('Affiliate cart attribution update failed', error);
  });
})();
