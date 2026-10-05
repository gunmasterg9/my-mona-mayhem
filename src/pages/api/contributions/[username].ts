import type { APIRoute } from 'astro';

export const prerender = false;

const UPSTREAM_TIMEOUT_MS = 8_000;
const SUCCESS_CACHE_CONTROL = 'public, max-age=300';
const DEFAULT_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const USERNAME_PATTERN = /^(?!.*--)[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

type ContributionDay = {
	weekday: number;
	count: number;
	level: number;
	date?: string;
};

type ContributionWeek = {
	first_day?: string;
	contribution_days: ContributionDay[];
};

type ContributionPayload = {
	total_contributions?: number;
	totalContributions?: number;
	from?: string;
	to?: string;
	range_start?: string;
	range_end?: string;
	start_date?: string;
	end_date?: string;
	weeks: ContributionWeek[];
	colors_full?: string[];
	colors?: string[];
	schema?: string;
	generated_at?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isContributionDay(value: unknown): value is ContributionDay {
	return (
		isRecord(value) &&
		typeof value.weekday === 'number' &&
		Number.isInteger(value.weekday) &&
		value.weekday >= 0 &&
		value.weekday <= 6 &&
		isNonNegativeInteger(value.count) &&
		typeof value.level === 'number' &&
		Number.isInteger(value.level) &&
		value.level >= 0 &&
		value.level <= 4 &&
		(value.date === undefined || typeof value.date === 'string')
	);
}

function isContributionWeek(value: unknown): value is ContributionWeek {
	return (
		isRecord(value) &&
		(value.first_day === undefined || typeof value.first_day === 'string') &&
		Array.isArray(value.contribution_days) &&
		value.contribution_days.every(isContributionDay)
	);
}

function isColorPalette(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every((color) => typeof color === 'string');
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
	return value === undefined || isNonNegativeInteger(value);
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === 'string';
}

function parseContributionPayload(value: unknown): ContributionPayload | null {
	if (!isRecord(value) || !Array.isArray(value.weeks) || !value.weeks.every(isContributionWeek)) {
		return null;
	}

	if (
		!isOptionalNonNegativeInteger(value.total_contributions) ||
		!isOptionalNonNegativeInteger(value.totalContributions) ||
		!isOptionalString(value.from) ||
		!isOptionalString(value.to) ||
		!isOptionalString(value.range_start) ||
		!isOptionalString(value.range_end) ||
		!isOptionalString(value.start_date) ||
		!isOptionalString(value.end_date) ||
		!isOptionalString(value.schema) ||
		!isOptionalString(value.generated_at) ||
		(value.colors_full !== undefined && !isColorPalette(value.colors_full)) ||
		(value.colors !== undefined && !isColorPalette(value.colors))
	) {
		return null;
	}

	return value as ContributionPayload;
}

function jsonError(status: number, error: string, username?: string): Response {
	return new Response(JSON.stringify({ error, ...(username ? { username } : {}) }), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
		},
	});
}

export const GET: APIRoute = async ({ params }) => {
	const username = params.username?.trim() ?? '';

	if (!username) {
		return jsonError(400, 'Username is required.');
	}

	if (username.length > 39 || !USERNAME_PATTERN.test(username)) {
		return jsonError(400, 'Invalid GitHub username.');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

	try {
		const response = await fetch(`https://github.com/${username}.contribs`, {
			headers: {
				Accept: 'application/json',
				'User-Agent': 'MonaMayhem/1.0 (+https://github.com/gunmasterg9/my-mona-mayhem)',
			},
			signal: controller.signal,
		});

		if (response.status === 404) {
			return jsonError(404, `GitHub user "${username}" was not found.`, username);
		}

		if (!response.ok) {
			return jsonError(502, 'GitHub could not provide contribution data.', username);
		}

		let upstreamData: unknown;
		try {
			upstreamData = await response.json();
		} catch {
			if (controller.signal.aborted) {
				return jsonError(504, 'GitHub contribution request timed out.', username);
			}

			return jsonError(502, 'GitHub returned malformed JSON.', username);
		}

		const payload = parseContributionPayload(upstreamData);
		if (!payload) {
			return jsonError(502, 'GitHub returned an invalid contribution response.', username);
		}

		const totalContributions =
			payload.total_contributions ??
			payload.totalContributions ??
			payload.weeks.reduce(
				(total, week) => total + week.contribution_days.reduce((weekTotal, day) => weekTotal + day.count, 0),
				0,
			);
		const colors = payload.colors_full ?? payload.colors ?? DEFAULT_COLORS;

		return new Response(
			JSON.stringify({
				username,
				total_contributions: totalContributions,
				totalContributions,
				from: payload.from ?? payload.range_start ?? payload.start_date ?? null,
				to: payload.to ?? payload.range_end ?? payload.end_date ?? null,
				weeks: payload.weeks,
				colors_full: colors,
				colors,
				schema: payload.schema ?? 'github-contribution-graph',
				generated_at: payload.generated_at ?? new Date().toISOString(),
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': SUCCESS_CACHE_CONTROL,
				},
			},
		);
	} catch {
		if (controller.signal.aborted) {
			return jsonError(504, 'GitHub contribution request timed out.', username);
		}

		return jsonError(502, 'Unable to fetch contribution data from GitHub.', username);
	} finally {
		clearTimeout(timeout);
	}
};
