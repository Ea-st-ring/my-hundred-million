import { Button } from "@/components/ui/button";

type SectionYearMonthImportControlProps = {
	onOpen: () => void;
	disabled?: boolean;
	loading: boolean;
};

export function SectionYearMonthImportControl({
	onOpen,
	disabled = false,
	loading,
}: SectionYearMonthImportControlProps) {
	return (
		<div className="mt-3 flex items-center justify-end">
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={onOpen}
				disabled={disabled}
			>
				{loading ? "불러오는 중..." : "특정 연월 데이터 불러오기"}
			</Button>
		</div>
	);
}
