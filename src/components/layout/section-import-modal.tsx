import { LayerModal } from "@/components/common/layer-modal";
import { Button } from "@/components/ui/button";

type SectionImportModalProps = {
	open: boolean;
	titleLabel: string;
	selectedMonthLabel: string;
	yearMonth: string;
	onChangeYearMonth: (value: string) => void;
	onImport: () => void;
	disabled: boolean;
	loading: boolean;
	onClose: () => void;
};

export function SectionImportModal({
	open,
	titleLabel,
	selectedMonthLabel,
	yearMonth,
	onChangeYearMonth,
	onImport,
	disabled,
	loading,
	onClose,
}: SectionImportModalProps) {
	if (!open) {
		return null;
	}

	return (
		<LayerModal open title={`${titleLabel} 데이터 불러오기`} onClose={onClose}>
			<p className="text-sm text-slate-600">
				현재 선택 월은 {selectedMonthLabel}입니다. 불러올 기준 연월을
				선택해주세요.
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<input
					type="month"
					value={yearMonth}
					onChange={(event) => onChangeYearMonth(event.target.value)}
					className="rounded-md border border-slate-300 px-3 py-2 text-sm"
				/>
				<Button type="button" onClick={onImport} disabled={disabled}>
					{loading ? "불러오는 중..." : "불러오기"}
				</Button>
			</div>
		</LayerModal>
	);
}
