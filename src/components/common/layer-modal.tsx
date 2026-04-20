import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type LayerModalProps = {
	open: boolean;
	title: string;
	onClose: () => void;
	children: ReactNode;
};

export function LayerModal({
	open,
	title,
	onClose,
	children,
}: LayerModalProps) {
	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
			<div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-lg font-semibold">{title}</h3>
					<Button type="button" variant="outline" size="sm" onClick={onClose}>
						닫기
					</Button>
				</div>
				<div className="max-h-[72vh] overflow-y-auto pr-1">{children}</div>
			</div>
		</div>
	);
}
