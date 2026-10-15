"use client";
import { ErrorBox } from "@/components/catalog";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-pad">
      <ErrorBox
        error={new Error("Something interrupted this page. Please try again.")}
        retry={reset}
      />
    </div>
  );
}
