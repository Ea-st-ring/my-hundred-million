import type { Dispatch, SetStateAction } from "react";

import { CurrencyInput } from "@/components/common/currency-input";
import { LayerModal } from "@/components/common/layer-modal";
import { Button } from "@/components/ui/button";
import { formatKrw, formatUsd } from "@/lib/format";
import type { FinanceOverview } from "@/types/finance";

type StockDepositModalProps = {
	open: boolean;
	overview: FinanceOverview;
	savingOverviewState: boolean;
	setOverview: Dispatch<SetStateAction<FinanceOverview>>;
	onSave: () => void | Promise<void>;
	onClose: () => void;
};

export function StockDepositModal({
	open,
	overview,
	savingOverviewState,
	setOverview,
	onSave,
	onClose,
}: StockDepositModalProps) {
	return (
		<LayerModal open={open} title="증권 계좌 예치금 입력" onClose={onClose}>
			<p className="text-sm text-slate-600">
				토스/삼성 계좌의 현금 예치금을 통화와 함께 입력합니다.
			</p>
			<div className="mt-4 grid gap-3 md:grid-cols-2">
				<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
					<p className="text-xs font-medium text-slate-700">토스증권</p>
					<div className="mt-2 grid grid-cols-[92px_minmax(0,1fr)] gap-2">
						<select
							value={overview.tossDepositCurrency}
							onChange={(event) =>
								setOverview((prev) => ({
									...prev,
									tossDepositCurrency: event.target.value as "KRW" | "USD",
								}))
							}
							className="rounded-md border border-slate-300 px-2 py-2 text-sm"
						>
							<option value="KRW">원화</option>
							<option value="USD">USD</option>
						</select>
						<CurrencyInput
							value={overview.tossDepositAmount}
							onChange={(value) =>
								setOverview((prev) => ({
									...prev,
									tossDepositAmount: value,
								}))
							}
						/>
					</div>
					<p className="mt-2 text-xs text-slate-500">
						{overview.tossDepositCurrency === "USD"
							? formatUsd(overview.tossDepositAmount)
							: formatKrw(overview.tossDepositAmount)}
					</p>
				</div>
				<div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
					<p className="text-xs font-medium text-slate-700">삼성증권</p>
					<div className="mt-2 grid grid-cols-[92px_minmax(0,1fr)] gap-2">
						<select
							value={overview.samsungDepositCurrency}
							onChange={(event) =>
								setOverview((prev) => ({
									...prev,
									samsungDepositCurrency: event.target.value as "KRW" | "USD",
								}))
							}
							className="rounded-md border border-slate-300 px-2 py-2 text-sm"
						>
							<option value="KRW">원화</option>
							<option value="USD">USD</option>
						</select>
						<CurrencyInput
							value={overview.samsungDepositAmount}
							onChange={(value) =>
								setOverview((prev) => ({
									...prev,
									samsungDepositAmount: value,
								}))
							}
						/>
					</div>
					<p className="mt-2 text-xs text-slate-500">
						{overview.samsungDepositCurrency === "USD"
							? formatUsd(overview.samsungDepositAmount)
							: formatKrw(overview.samsungDepositAmount)}
					</p>
				</div>
			</div>
			<div className="mt-4 flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={onClose}>
					닫기
				</Button>
				<Button
					type="button"
					onClick={() => void onSave()}
					disabled={savingOverviewState}
				>
					{savingOverviewState ? "저장 중..." : "저장"}
				</Button>
			</div>
		</LayerModal>
	);
}
