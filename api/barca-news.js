module.exports = async (req, res) => {
  try {
    const BARCA_URL =
      'https://www.fcbarcelona.com/en/football/first-team/news';

    const response = await fetch(BARCA_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`FC Barcelona returned ${response.status}`);
    }

    const html = await response.text();

    /*
      Find article links from the official FC Barcelona
      first-team news page.
    */
    const regex =
      /<a[^>]+href="([^"]*\/en\/football\/first-team\/news\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    const items = [];
    const seen = new Set();

    let match;

    while ((match = regex.exec(html)) && items.length < 8) {
      const rawUrl = match[1];
      const rawTitle = match[2];

      // Build absolute URL
      let url;

      try {
        url = new URL(
          rawUrl,
          'https://www.fcbarcelona.com'
        ).href;
      } catch {
        continue;
      }

      // Security: only allow official FC Barcelona URLs
      const parsedUrl = new URL(url);

      if (parsedUrl.hostname !== 'www.fcbarcelona.com') {
        continue;
      }

      // Remove HTML from title
      const title = rawTitle
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

      if (!title || title.length < 8) {
        continue;
      }

      if (seen.has(url)) {
        continue;
      }

      seen.add(url);

      items.push({
        title,
        url
      });
    }

    /*
      Cache the result for 1 hour.
      stale-while-revalidate allows Vercel to serve
      an older result while updating it in the background.
    */
    res.setHeader(
      'Cache-Control',
      's-maxage=3600, stale-while-revalidate=86400'
    );

    return res.status(200).json({
      success: true,
      source: BARCA_URL,
      updatedAt: new Date().toISOString(),
      count: items.length,
      items
    });

  } catch (error) {
    console.error('Barça News API Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Unable to load Barça news right now.',
      items: []
    });
  }
};
