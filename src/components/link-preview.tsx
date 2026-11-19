"use client";

import { useEffect, useState } from "react";

type Preview = { image: string; finalUrl: string; title: string };
// unavailable: 미리보기 기능만 안 되는 경우(브라우저를 못 띄우는 환경). 진단은 할 수 있어요.
// blocked: 링크 자체가 진단할 수 없는 경우(앱 링크, 차단된 사이트, 열리지 않는 페이지).
type State =
  | { kind: "loading" }
  | { kind: "ok"; preview: Preview }
  | { kind: "error"; message: string; unavailable: boolean };

/** 입력한 링크의 화면 미리보기 (맨 위 부분). 확인용이라 실패해도 진단은 그대로 할 수 있어요. */
export function LinkPreview({ url }: { url: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ kind: "loading" });
    fetch("/api/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) return setState({ kind: "ok", preview: data });
        setState({ kind: "error", message: data.error ?? "화면을 불러오지 못했어요.", unavailable: res.status >= 500 });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ kind: "error", message: "화면을 불러오지 못했어요.", unavailable: true });
      });
    return () => ctrl.abort();
  }, [url]);

  const host = (() => { try { return new URL(url).host; } catch { return url; } })();

  return (
    <figure className="preview" aria-live="polite">
      <div className="screen-bar">
        <span /><span /><span />
        <span className="screen-url">{host}</span>
      </div>
      <div className="preview-body">
        {state.kind === "loading" && (
          <div className="preview-msg"><span className="pulse" />화면을 불러오고 있어요…</div>
        )}
        {state.kind === "error" && (
          <div className={`preview-msg${state.unavailable ? "" : " blocked"}`}>
            {state.message}
            {state.unavailable ? <span>진단은 그대로 할 수 있어요.</span> : <span>링크를 바꿔주세요.</span>}
          </div>
        )}
        {state.kind === "ok" && (
          // eslint-disable-next-line @next/next/no-img-element -- 서버가 찍은 data URL 스크린샷이에요
          <img src={state.preview.image} alt={`${state.preview.title || host} 화면 미리보기`} />
        )}
      </div>
      {state.kind === "ok" && state.preview.title && <figcaption>{state.preview.title}</figcaption>}
    </figure>
  );
}
