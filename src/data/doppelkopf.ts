import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type PlayerKey = "jakob" | "adam" | "christian" | "konrad";

export type MatchResult = {
  date: Date;
  seating: string;
  jakob: number;
  adam: number;
  christian: number;
  konrad: number;
};

export type ResultTableRow = {
  date: string;
  seating: string;
  jakob: number;
  adam: number;
  christian: number;
  konrad: number;
  isTotal: boolean;
};

export type PlacementStatsRow = {
  label: string;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  fourthPlaces: number;
  status: string;
};

export type SeatNeighborStatsRow = {
  label: string;
  leftShare: number;
  rightShare: number;
};

export const players: Array<{ key: PlayerKey; label: string; short: string }> = [
  { key: "jakob", label: "Jakob", short: "J" },
  { key: "adam", label: "Adam", short: "A" },
  { key: "christian", label: "Christian", short: "C" },
  { key: "konrad", label: "Konrad", short: "K" }
];

const csvPath = fileURLToPath(new URL("../../assets/doppelkopf/results.csv", import.meta.url));
const csvText = readFileSync(csvPath, "utf8");

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function parseGermanDate(value: string) {
  const [day, month, year] = value.split(".").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatGermanDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export { formatGermanDate };

function getUtcDayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

function getDaysSince(date: Date, now = new Date()) {
  return Math.max(0, getUtcDayNumber(now) - getUtcDayNumber(date));
}

function createPlacementCounts() {
  return players.reduce(
    (counts, player) => {
      counts[player.key] = [0, 0, 0, 0];
      return counts;
    },
    {} as Record<PlayerKey, [number, number, number, number]>
  );
}

function getRankedPlayers(scores: Record<PlayerKey, number>) {
  let previousScore: number | null = null;
  let previousRank = 0;

  return players
    .map((player) => ({
      key: player.key,
      label: player.label,
      score: scores[player.key]
    }))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .map((entry, index) => {
      const rank = previousScore !== null && entry.score === previousScore ? previousRank : index + 1;
      previousScore = entry.score;
      previousRank = rank;

      return {
        ...entry,
        rank
      };
    });
}

function incrementPlacementCounts(
  counts: Record<PlayerKey, [number, number, number, number]>,
  rankedEntries: Array<{ key: PlayerKey; rank: number }>
) {
  for (const entry of rankedEntries) {
    if (entry.rank >= 1 && entry.rank <= 4) {
      counts[entry.key][entry.rank - 1] += 1;
    }
  }
}

function sortPlacementRows(left: PlacementStatsRow, right: PlacementStatsRow) {
  return right.firstPlaces - left.firstPlaces
    || right.secondPlaces - left.secondPlaces
    || right.thirdPlaces - left.thirdPlaces
    || left.fourthPlaces - right.fourthPlaces
    || left.label.localeCompare(right.label);
}

function parseResults(text: string): MatchResult[] {
  const [headerLine, ...dataLines] = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);

  return dataLines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const columns = parseCsvLine(line);
      const entry = Object.fromEntries(headers.map((header, index) => [header, columns[index] ?? ""]));

      return {
        date: parseGermanDate(entry.date),
        seating: entry.seating,
        jakob: Number.parseInt(entry.jakob, 10),
        adam: Number.parseInt(entry.adam, 10),
        christian: Number.parseInt(entry.christian, 10),
        konrad: Number.parseInt(entry.konrad, 10)
      };
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

export const results = parseResults(csvText);

export const seasons = [...new Set(results.map((match) => match.date.getUTCFullYear()))].sort((left, right) => right - left);

export function getSeasonResults(season: number) {
  return results.filter((match) => match.date.getUTCFullYear() === season);
}

export function getTotals(matches: MatchResult[]) {
  return players.reduce(
    (totals, player) => {
      totals[player.key] = matches.reduce((sum, match) => sum + match[player.key], 0);
      return totals;
    },
    {} as Record<PlayerKey, number>
  );
}

export function getLeaderboard(matches: MatchResult[]) {
  const totals = getTotals(matches);

  const leaderboard = players
    .map((player) => ({
      ...player,
      total: totals[player.key]
    }))
    .sort((left, right) => right.total - left.total);

  return leaderboard.map((entry, index) => ({
    ...entry,
    gapToPrevious: index === 0 ? null : leaderboard[index - 1].total - entry.total
  }));
}

export function getTableRows(matches: MatchResult[], includeTotal = true): ResultTableRow[] {
  const totals = getTotals(matches);

  const rows = matches.map((match) => ({
    date: formatGermanDate(match.date),
    seating: match.seating,
    jakob: match.jakob,
    adam: match.adam,
    christian: match.christian,
    konrad: match.konrad,
    isTotal: false
  }));

  if (!includeTotal) {
    return rows;
  }

  return rows.concat({
    date: "",
    seating: "Gesamt",
    jakob: totals.jakob,
    adam: totals.adam,
    christian: totals.christian,
    konrad: totals.konrad,
    isTotal: true
  });
}

export function getLatestMatches(limit: number) {
  return [...results].sort((left, right) => right.date.getTime() - left.date.getTime()).slice(0, limit);
}

export function getLatestMatch() {
  return results.at(-1) ?? null;
}

export function getSeasonSummary(season: number) {
  const matches = getSeasonResults(season);
  const leaderboard = getLeaderboard(matches);

  return {
    season,
    matches,
    leaderboard,
    leader: leaderboard[0] ?? null
  };
}

export function getAllTimeSummary() {
  const leaderboard = getLeaderboard(results);

  return {
    matches: results,
    leaderboard,
    leader: leaderboard[0] ?? null
  };
}

export function getSeatingStats() {
  const orderCounts = new Map<string, number>();
  const positionCounts = players.reduce(
    (counts, player) => {
      counts[player.label] = [0, 0, 0, 0];
      return counts;
    },
    {} as Record<string, number[]>
  );

  for (const match of results) {
    orderCounts.set(match.seating, (orderCounts.get(match.seating) ?? 0) + 1);

    match.seating.split("").forEach((shortName, index) => {
      const player = players.find((entry) => entry.short === shortName);
      if (player) {
        positionCounts[player.label][index] += 1;
      }
    });
  }

  return {
    orderCounts: [...orderCounts.entries()]
      .map(([order, count]) => ({ order, count }))
      .sort((left, right) => right.count - left.count || left.order.localeCompare(right.order)),
    positionCounts
  };
}

export function getSeatNeighborStats(): SeatNeighborStatsRow[] {
  const neighborPoints = players.reduce(
    (totals, player) => {
      totals[player.key] = { left: 0, right: 0 };
      return totals;
    },
    {} as Record<PlayerKey, { left: number; right: number }>
  );

  for (const match of results) {
    const seating = match.seating.split("");

    for (const player of players) {
      const seatIndex = seating.indexOf(player.short);
      if (seatIndex === -1) {
        continue;
      }

      const leftNeighborShort = seating[(seatIndex + 1) % seating.length];
      const rightNeighborShort = seating[(seatIndex - 1 + seating.length) % seating.length];
      const leftNeighbor = players.find((entry) => entry.short === leftNeighborShort);
      const rightNeighbor = players.find((entry) => entry.short === rightNeighborShort);

      if (leftNeighbor) {
        neighborPoints[player.key].left += match[leftNeighbor.key];
      }

      if (rightNeighbor) {
        neighborPoints[player.key].right += match[rightNeighbor.key];
      }
    }
  }

  const totalLeftPoints = players.reduce((sum, player) => sum + neighborPoints[player.key].left, 0);
  const totalRightPoints = players.reduce((sum, player) => sum + neighborPoints[player.key].right, 0);

  return players.map((player) => {
    const left = neighborPoints[player.key].left;
    const right = neighborPoints[player.key].right;
    const leftShare = totalLeftPoints === 0 ? 0 : (left / totalLeftPoints) * 100;
    const rightShare = totalRightPoints === 0 ? 0 : (right / totalRightPoints) * 100;

    return {
      label: player.label,
      leftShare,
      rightShare
    };
  });
}

export function getChampionshipPlacementStats(now = new Date()): PlacementStatsRow[] {
  const counts = createPlacementCounts();
  const firstRecordedDate = results[0]?.date ?? now;
  const lastTitleDates: Partial<Record<PlayerKey, Date>> = {};
  const currentYear = now.getUTCFullYear();

  for (const season of seasons) {
    if (season >= currentYear) {
      continue;
    }

    const seasonMatches = getSeasonResults(season);
    if (seasonMatches.length === 0) {
      continue;
    }

    const rankedEntries = getRankedPlayers(getTotals(seasonMatches));
    incrementPlacementCounts(counts, rankedEntries);

    const seasonEndDate = seasonMatches.at(-1)?.date ?? firstRecordedDate;
    for (const entry of rankedEntries.filter((rankedEntry) => rankedEntry.rank === 1)) {
      lastTitleDates[entry.key] = seasonEndDate;
    }
  }

  const reigningSeason = seasons.find((season) => season < currentYear) ?? seasons[0];
  const reigningChampionKeys = new Set<PlayerKey>();

  if (reigningSeason !== undefined) {
    const reigningMatches = getSeasonResults(reigningSeason);
    const reigningEntries = getRankedPlayers(getTotals(reigningMatches));
    for (const entry of reigningEntries.filter((rankedEntry) => rankedEntry.rank === 1)) {
      reigningChampionKeys.add(entry.key);
    }
  }

  return players
    .map((player) => ({
      label: player.label,
      firstPlaces: counts[player.key][0],
      secondPlaces: counts[player.key][1],
      thirdPlaces: counts[player.key][2],
      fourthPlaces: counts[player.key][3],
      status: reigningChampionKeys.has(player.key)
        ? "Amtierender Meister"
        : `Wartet auf Meisterschaft seit ${getDaysSince(lastTitleDates[player.key] ?? firstRecordedDate, now)} Tagen`
    }))
    .sort(sortPlacementRows);
}

export function getMatchdayPlacementStats(now = new Date()): PlacementStatsRow[] {
  const counts = createPlacementCounts();
  const firstRecordedDate = results[0]?.date ?? now;
  const lastWinDates: Partial<Record<PlayerKey, Date>> = {};
  const latestMatch = results.at(-1);
  const latestWinnerKeys = new Set<PlayerKey>();

  for (const match of results) {
    const rankedEntries = getRankedPlayers({
      jakob: match.jakob,
      adam: match.adam,
      christian: match.christian,
      konrad: match.konrad
    });

    incrementPlacementCounts(counts, rankedEntries);

    for (const entry of rankedEntries.filter((rankedEntry) => rankedEntry.rank === 1)) {
      lastWinDates[entry.key] = match.date;
      if (latestMatch?.date.getTime() === match.date.getTime()) {
        latestWinnerKeys.add(entry.key);
      }
    }
  }

  return players
    .map((player) => ({
      label: player.label,
      firstPlaces: counts[player.key][0],
      secondPlaces: counts[player.key][1],
      thirdPlaces: counts[player.key][2],
      fourthPlaces: counts[player.key][3],
      status: latestWinnerKeys.has(player.key)
        ? "Aktueller Spieltagssieger"
        : `Wartet auf Spieltagssieg seit ${getDaysSince(lastWinDates[player.key] ?? firstRecordedDate, now)} Tagen`
    }))
    .sort(sortPlacementRows);
}
