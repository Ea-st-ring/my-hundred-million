import { useCallback, useEffect, useState } from "react";

import { LayerModal } from "@/components/common/layer-modal";
import { Button } from "@/components/ui/button";
import { formatKrw, formatUsd } from "@/lib/format";
import { saveOverview } from "@/lib/repository";
import { fetchTossBuyingPower } from "@/lib/toss-invest/api";
import { TossInvestError } from "@/lib/toss-invest/client";
import type { TossCurrency } from "@/lib/toss-invest/types";
import type { FinanceOverview } from "@/types/finance";

type TossDepositPreviewModalProps = {
	open: boolean;
	overview: FinanceOverview;
	onClose: () => void;
	onApplied: (nextOverview: FinanceOverview) => void;
	onMessage: (message: string) => void;
};

export function TossDepositPreviewModal({
	open,
	overview,
	onClose,
	onApplied,
	onMessage,
}: TossDepositPreviewModalProps) {
	const [loading, setLoading] = useState(false);
	const [applying, setApplying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [krwBuyingPower, setKrwBuyingPower] = useState<number | null>(null);
	const [usdBuyingPower, setUsdBuyingPower] = useState<number | null>(null);
	const [selectedCurrency, setSelectedCurrency] = useState<TossCurrency>("KRW");

	const loadBuyingPower = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [krw, usd] = await Promise.all([
				fetchTossBuyingPower("KRW"),
				fetchTossBuyingPower("USD"),
			]);
			setKrwBuyingPower(Number(krw.cashBuyingPower));
			setUsdBuyingPower(Number(usd.cashBuyingPower));
		} catch (thrown) {
			setError(
				thrown instanceof TossInvestError
					? thrown.message
					: "토스증권 매수가능금액 조회에 실패했습니다.",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) {
			void loadBuyingPower();
		}
	}, [open, loadBuyingPower]);

	async function handleApply() {
		const amount = selectedCurrency === "KRW" ? krwBuyingPower : usdBuyingPower;
		if (amount === null) {
			return;
		}
		setApplying(true);
		setError(null);
		try {
			const nextOverview: FinanceOverview = {
				...overview,
				tossDepositAmount: amount,
				tossDepositCurrency: selectedCurrency,
			};
			await saveOverview(nextOverview);
			onApplied(nextOverview);
			onMessage("토스증권 예치금(현금 매수가능금액)이 동기화되었습니다.");
			onClose();
		} catch (thrown) {
			setError(
				thrown instanceof Error
					? thrown.message
					: "예치금 반영 중 오류가 발생했습니다.",
			);
		} finally {
			setApplying(false);
		}
	}

	return (
		<LayerModal open={open} title="토스증권 예치금 동기화" onClose={onClose}>
			<p className="text-sm text-slate-600">
				토스증권에는 별도의 예치금 조회 API가 없어, 미수 없이 즉시 매수 가능한
				현금 기준 금액(매수가능금액)을 대신 가져옵니다. 실제 예치금과 다를 수
				있습니다.
			</p>
			<p className="mt-1 text-xs text-slate-500">
				현재 저장된 값:{" "}
				{overview.tossDepositCurrency === "USD"
					? formatUsd(overview.tossDepositAmount)
					: formatKrw(overview.tossDepositAmount)}
			</p>

			{loading ? (
				<p className="mt-4 text-sm text-slate-500">불러오는 중...</p>
			) : null}
			{error !== null ? (
				<p className="mt-4 text-sm text-rose-600">{error}</p>
			) : null}

			{!loading && krwBuyingPower !== null && usdBuyingPower !== null ? (
				<div className="mt-4 grid gap-2 md:grid-cols-2">
					<label
						className={`cursor-pointer rounded-lg border p-3 text-sm ${
							selectedCurrency === "KRW"
								? "border-slate-900"
								: "border-slate-200"
						}`}
					>
						<input
							type="radio"
							name="toss-deposit-currency"
							className="mr-2"
							checked={selectedCurrency === "KRW"}
							onChange={() => setSelectedCurrency("KRW")}
						/>
						원화(KRW) 매수가능금액
						<p className="mt-1 font-semibold">{formatKrw(krwBuyingPower)}</p>
					</label>
					<label
						className={`cursor-pointer rounded-lg border p-3 text-sm ${
							selectedCurrency === "USD"
								? "border-slate-900"
								: "border-slate-200"
						}`}
					>
						<input
							type="radio"
							name="toss-deposit-currency"
							className="mr-2"
							checked={selectedCurrency === "USD"}
							onChange={() => setSelectedCurrency("USD")}
						/>
						달러(USD) 매수가능금액
						<p className="mt-1 font-semibold">{formatUsd(usdBuyingPower)}</p>
					</label>
				</div>
			) : null}

			<div className="mt-5 flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={() => void loadBuyingPower()}
					disabled={loading || applying}
				>
					새로고침
				</Button>
				<Button
					type="button"
					onClick={() => void handleApply()}
					disabled={loading || applying || krwBuyingPower === null}
				>
					{applying ? "반영 중..." : "선택한 값 반영"}
				</Button>
			</div>
		</LayerModal>
	);
}
