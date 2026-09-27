// Same-origin relay for centralized, idempotent study assignment.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ok:false});
  }
  const endpoint = process.env.GOOGLE_SCRIPT_URL;
  const token = process.env.GOOGLE_SCRIPT_TOKEN;
  if (!endpoint || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint) || !token) {
    return res.status(503).json({ok:false, error:'Assignment is not configured.'});
  }
  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!payload || Array.isArray(payload) || JSON.stringify(payload).length > 1000 ||
        !/^P-[A-Z0-9-]{8,80}$/.test(payload.participant_id || '') || payload.consent !== 'Yes') {
      return res.status(400).json({ok:false});
    }
  } catch (_) { return res.status(400).json({ok:false}); }
  try {
    const upstream = await fetch(endpoint, {
      method:'POST', headers:{'Content-Type':'application/json'}, redirect:'follow',
      body:JSON.stringify({token, action:'assign', payload:{participant_id:payload.participant_id, consent:'Yes'}}),
      signal:AbortSignal.timeout(20000)
    });
    const result = await upstream.json();
    if (!upstream.ok || result.ok !== true || result.participant_id !== payload.participant_id ||
        !['control','treatment'].includes(result.condition)) {
      return res.status(502).json({ok:false, error:'Assignment was not confirmed.'});
    }
    return res.status(200).json({ok:true, participant_id:result.participant_id, condition:result.condition});
  } catch (_) {
    return res.status(502).json({ok:false, error:'Could not confirm assignment. Please retry.'});
  }
};
