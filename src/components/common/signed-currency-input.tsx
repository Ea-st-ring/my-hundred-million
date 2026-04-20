import { formatNumber } from "@/lib/format";

type SignedCurrencyInputProps = {
	value: number;
	onChange: (value: number) => void;
};

export function SignedCurrencyInput({
	value,
	onChange,
}: SignedCurrencyInputProps) {
	const absolute = Math.abs(value);
	const displayValue =
		absolute === 0 ? "" : `${value < 0 ? "-" : ""}${formatNumber(absolute)}`;
	return (
		<input
			inputMode="numeric"
			className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
			value={displayValue}
			onChange={(event) =>
				onChange(parseSignedIntegerInput(event.target.value))
			}
			placeholder="0"
		/>
	);
}

function parseSignedIntegerInput(input: string): number {
	const trimmed = input.trim();
	if (trimmed.length === 0) {
		return 0;
	}
	const isNegative = trimmed.startsWith("-");
	const digitsOnly = trimmed.replaceAll(/[^\d]/g, "");
	if (digitsOnly.length === 0) {
		return 0;
	}
	const parsed = Number.parseInt(digitsOnly, 10);
	if (!Number.isFinite(parsed)) {
		return 0;
	}
	return isNegative ? -parsed : parsed;
}
