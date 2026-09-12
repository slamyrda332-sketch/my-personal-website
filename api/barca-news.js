/*
  Combined Barça news feed:
  - MARCA (official published RSS feed — news articles)
  - Gerard Romero's official YouTube channel RSS
    (transfer market videos/rumors — clearly labeled as such)

  Both are fetched via their own official, publicly published
  feeds (no HTML scraping), so this doesn't rely on guessing a
  page's internal structure and isn't affected by the source
  site's design changing.
*/

const MARCA_RSS = 'https://e00-marca.uecdn.es/rss/futbol/barcelona.xml';
const ROMERO_CHANNEL_ID = 'UC0Cbaofl1u2ZSCUjZ9yy-wg';
const ROMERO_RSS = `https://www.youtube.com/feeds/videos.xml?channel_id=${ROMERO_CHANNEL_ID}`;

function decodeEntities(str = '') {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block, tag) {
  const cdataMatch = block.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
  );
  if (cdataMatch) return cdataMatch[1];
  const plainMatch = block.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  );
  return plainMatch ? plainMatch[1] : '';
}

/*
  Best-effort categorization based on keywords actually present in the
  title/summary — never guessed or invented, just simple keyword matching
  on the real published text (Spanish, since that's the source language).
*/
function categorizeMarcaItem(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  if (/fichaje|traspaso|renovaci[oó]n|mercado/i.test(text)) return 'نقل‌وانتقالات';
  if (/champions/i.test(text)) return 'لیگ قهرمانان';
  if (/liga\b/i.test(text)) return 'لالیگا';
  return 'بارسلونا';
}

async function fetchMarca() {
  try {
    const res = await fetch(MARCA_RSS, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`Marca RSS returned ${res.status}`);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);

    return items.map((m) => {
      const block = m[1];
      const title = decodeEntities(extractTag(block, 'title'));
      const rawSummary = decodeEntities(extractTag(block, 'description'))
        .replace(/Leer\s*$/i, '')
        .trim();
      const link = extractTag(block, 'link').trim();
      const pubDate = extractTag(block, 'pubDate').trim();
      const imageMatch = block.match(/<media:content[^>]+url="([^"]+)"/i);
      const isoDate = pubDate ? new Date(pubDate).toISOString() : null;

      return {
        title,
        summary: rawSummary,
        description: rawSummary,
        url: link,
        date: isoDate,
        publishedAt: isoDate,
        image: imageMatch ? imageMatch[1] : null,
        source: 'MARCA',
        kind: 'news',
        category: categorizeMarcaItem(title, rawSummary),
        transferStatus: null
      };
    });
  } catch (err) {
    console.error('Marca fetch failed:', err);
    return [];
  }
}

async function fetchRomero() {
  try {
    const res = await fetch(ROMERO_RSS);
    if (!res.ok) throw new Error(`YouTube RSS returned ${res.status}`);
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 5);

    return entries.map((m) => {
      const block = m[1];
      const title = decodeEntities(extractTag(block, 'title'));
      const linkMatch = block.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/i);
      const published = extractTag(block, 'published').trim();
      const thumbMatch = block.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
      const isoDate = published ? new Date(published).toISOString() : null;
      const summary = 'ویدیوی گزارش/شایعه نقل و انتقالات — کانال یوتیوب Gerard Romero';

      return {
        title,
        summary,
        description: summary,
        url: linkMatch ? linkMatch[1] : '',
        date: isoDate,
        publishedAt: isoDate,
        image: thumbMatch ? thumbMatch[1] : null,
        source: 'Gerard Romero (YouTube)',
        kind: 'rumor',
        category: 'نقل‌وانتقالات',
        transferStatus: 'rumor'
      };
    });
  } catch (err) {
    console.error('Gerard Romero fetch failed:', err);
    return [];
  }
}

async function translateToPersian(text, sourceLang = 'es') {
  if (!text) return text;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        text
      )}&langpair=${sourceLang}|fa`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated || translated.includes('MYMEMORY WARNING')) return text;
    return translated;
  } catch (err) {
    console.error('Translation failed for:', text, err);
    return text;
  }
}

module.exports = async (req, res) => {
  try {
    const [marcaItems, romeroItems] = await Promise.all([
      fetchMarca(),
      fetchRomero()
    ]);

    let combined = [...marcaItems, ...romeroItems].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    // Cap total items before translating, to keep translation calls reasonable
    combined = combined.slice(0, 10);

    const translated = await Promise.all(
      combined.map(async (item) => {
        const translatedTitle = await translateToPersian(item.title);
        const translatedSummary =
          item.kind === 'news'
            ? await translateToPersian(item.summary)
            : item.summary; // Romero's caption is already Persian text

        return {
          ...item,
          title: translatedTitle,
          summary: translatedSummary,
          description: translatedSummary,
          originalTitle: item.title
        };
      })
    );

    res.setHeader(
      'Cache-Control',
      's-maxage=1800, stale-while-revalidate=86400'
    );
    return res.status(200).json({
      success: true,
      sources: [MARCA_RSS, ROMERO_RSS],
      updatedAt: new Date().toISOString(),
      count: translated.length,
      items: translated
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
