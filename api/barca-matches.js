/*
  FC Barcelona fixtures & results — powered by football-data.org (official API).

  Requires an environment variable on Vercel:
    FOOTBALL_DATA_API_KEY

  Get a free key at: https://www.football-data.org/client/register
  Free tier: 10 requests/minute — comfortably enough for a personal site,
  especially combined with the Cache-Control header below.

  FC Barcelona's team ID on football-data.org is 81.
*/

const TEAM_ID = 81;
const API_BASE = 'https://api.football-data.org/v4';

function mapStatus(status) {
  switch (status) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'آینده';
    case 'IN_PLAY':
    case 'PAUSED':
      return 'در حال برگزاری';
    case 'FINISHED':
      return 'پایان یافته';
    case 'POSTPONED':
      return 'به تعویق افتاده';
    case 'SUSPENDED':
      return 'متوقف شده';
    case 'CANCELLED':
      return 'لغو شده';
    default:
      return status || 'نامشخص';
  }
}

function mapMatch(match) {
  const isHome = match.homeTeam?.id === TEAM_ID;
  const opponent = isHome ? match.awayTeam?.name : match.homeTeam?.name;

  const score =
    match.status === 'FINISHED' && match.score?.fullTime
      ? {
          home: match.score.fullTime.home,
          away: match.score.fullTime.away
        }
      : null;

  return {
    opponent: opponent || 'حریف نامشخص',
    isHome,
    competition: match.competition?.name || '',
    date: match.utcDate || null,
    status: mapStatus(match.status),
    rawStatus: match.status,
    score
  };
}

module.exports = async (req, res) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  if (!apiKey) {
    // No key configured yet — fail gracefully, never invent matches.
    return res.status(200).json({
      success: false,
      error: 'FOOTBALL_DATA_API_KEY تنظیم نشده است.',
      matches: []
    });
  }

  try {
    const res1 = await fetch(
      `${API_BASE}/teams/${TEAM_ID}/matches?status=SCHEDULED&limit=5`,
      { headers: { 'X-Auth-Token': apiKey } }
    );
    const res2 = await fetch(
      `${API_BASE}/teams/${TEAM_ID}/matches?status=FINISHED&limit=5`,
      { headers: { 'X-Auth-Token': apiKey } }
    );

    if (!res1.ok || !res2.ok) {
      throw new Error(
        `football-data.org returned ${res1.status} / ${res2.status}`
      );
    }

    const upcoming = await res1.json();
    const recent = await res2.json();

    const matches = [
      ...(recent.matches || []).map(mapMatch),
      ...(upcoming.matches || []).map(mapMatch)
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    res.setHeader(
      'Cache-Control',
      's-maxage=900, stale-while-revalidate=3600'
    );
    return res.status(200).json({
      success: true,
      updatedAt: new Date().toISOString(),
      matches
    });
  } catch (error) {
    console.error('Barça matches API error:', error);
    return res.status(500).json({
      success: false,
      error: 'دریافت برنامه‌ی بازی‌ها با مشکل مواجه شد.',
      matches: []
    });
  }
};
