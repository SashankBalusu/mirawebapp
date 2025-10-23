export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { text, voice = 'alloy', format = 'mp3' } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'missing OPENAI_API_KEY on server' });
    }

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',  
        voice,
        input: text,
        format,
      }),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => '');
      return res.status(r.status).type('text/plain').send(err || 'OpenAI error');
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', `audio/${format}`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.send(buf);
  } catch (e) {
    console.error('[api/tts] error:', e);
    return res.status(500).json({ error: 'server error' });
  }
}
