const krwFormatter = new Intl.NumberFormat("ko-KR");
const fxFormatter = new Intl.NumberFormat("ko-KR", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});
const usdFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export function formatKrw(value: number): string {
	return `${krwFormatter.format(Math.round(value))}원`;
}

export function formatNumber(value: number): string {
	return krwFormatter.format(value);
}

export function formatFxRate(value: number): string {
	return fxFormatter.format(value);
}

export function formatUsd(value: number): string {
	return usdFormatter.format(value);
}

export function parseIntegerInput(value: string): number {
	const digits = value.replace(/[^0-9-]/g, "");
	if (digits.length === 0 || digits === "-") {
		return 0;
	}
	const parsed = Number.parseInt(digits, 10);
	return Number.isNaN(parsed) ? 0 : parsed;
}

export function clampPercent(value: number): number {
	if (value < 0) {
		return 0;
	}
	if (value > 100) {
		return 100;
	}
	return value;
}
