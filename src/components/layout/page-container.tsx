import type { ReactNode } from "react";

type PageContainerProps = {
	children: ReactNode;
};

export function PageContainer({ children }: PageContainerProps) {
	return (
		<main className="min-h-screen bg-zinc-100 px-3 py-8 text-slate-900 md:px-6 xl:px-8">
			{children}
		</main>
	);
}
