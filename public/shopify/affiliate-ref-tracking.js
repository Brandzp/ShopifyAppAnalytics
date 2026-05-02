(function () {
  var params = new URLSearchParams(window.location.search);
  var ref = params.get('ref');
  var clickId = params.get('agent_click_id');
  if (!ref && !clickId) return;

  try {
    if (ref) localStorage.setItem('affiliate_ref', ref);
    if (clickId) localStorage.setItem('affiliate_click_id', clickId);
  } catch (error) {
    console.warn('Affiliate tracking storage failed', error);
  }

  var savedRef = ref || localStorage.getItem('affiliate_ref');
  var savedClickId = clickId || localStorage.getItem('affiliate_click_id');
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
