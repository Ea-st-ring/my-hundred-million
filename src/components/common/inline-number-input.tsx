type InlineNumberInputProps = {
	label: string;
	value: number;
	step: number;
	onChange: (value: number) => void;
};

export function InlineNumberInput({
	label,
	value,
	step,
	onChange,
}: InlineNumberInputProps) {
	return (
		<div>
			<label className="mb-1 block text-xs font-medium">{label}</label>
			<input
				type="number"
				min="0"
				step={step}
				value={value}
				onChange={(event) =>
					onChange(Number.parseFloat(event.target.value || "0"))
				}
				className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
			/>
		</div>
	);
}
