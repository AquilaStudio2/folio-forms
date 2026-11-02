// oxlint-disable prefer-await-to-callbacks -- ONLYOFFICE's public plugin boundary exposes callback-only methods.
import { screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import popupHtml from "../../../onlyoffice-plugin/pdms-project/index.html?raw";
import { initializePdmsPopup } from "../../../onlyoffice-plugin/src/pdms-popup.js";

const rgb = (color: string) => {
  const channels = color
    .match(/[\d.]+/gu)
    ?.slice(0, 3)
    .map(Number);
  if (channels?.length !== 3) {
    throw new Error(`Expected an observable RGB color, received ${color}`);
  }
  return channels;
};
const luminance = (channels: number[]) =>
  channels
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    )
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
      0
    );
const contrast = (foreground: number[], background: number[]) => {
  const values = [luminance(foreground), luminance(background)].toSorted(
    (a, b) => b - a
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const backgroundOf = (element: Element): number[] => {
  const color = getComputedStyle(element).backgroundColor;
  if (
    (color === "transparent" || color === "rgba(0, 0, 0, 0)") &&
    element.parentElement
  ) {
    return backgroundOf(element.parentElement);
  }
  return rgb(color);
};

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  for (const node of document.head.querySelectorAll("[data-popup-test]")) {
    node.remove();
  }
  document.body.replaceChildren();
});

it.each([
  { background: "#ffffff", foreground: "#172033", theme: "light" },
  { background: "#333333", foreground: "#f1f1f1", theme: "dark" },
])(
  "keeps the adjacent popup readable with the native $theme palette",
  ({ background, foreground }) => {
    const style = document.createElement("style");
    style.dataset.popupTest = "";
    // The Office SDK applies the editor theme to the plugin body after our stylesheet.
    style.textContent = `${popupHtml.match(/<style>(?<css>[\s\S]*?)<\/style>/u)?.groups?.css}\nbody { background: ${background}; color: ${foreground}; } button { height: 30px; }`;
    document.head.append(style);
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const options = {
      bridgeId: "contrast-bridge",
      documentKey: "contrast-document",
      parentOrigin: window.location.origin,
      pdmsPopupChannelId: "contrast-channel",
    };
    const plugin = {
      executeMethod: (
        _method: string,
        _args: unknown[],
        callback?: () => void
      ) => callback?.(),
      info: { guid: "contrast-popup" },
    };
    initializePdmsPopup(window, document, plugin, options).locate();
    const request = post.mock.calls.at(-1)?.[0];
    const sendState = (state: object) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            ...request,
            source: "folio-pdms-popup-host",
            state,
            type: "state",
          },
          origin: options.parentOrigin,
          source: window,
        })
      );
    const readyState = {
      catalog: {
        names: Array.from(
          { length: 250 },
          (_, index) =>
            `โครงการทดสอบการแสดงชื่อโครงการที่ยาวหลายบรรทัดและยังอ่านได้ครบถ้วนโดยไม่ซ้อนกับรายการถัดไป ${index}`
        ),
        status: "ready",
      },
      target: { key: "project", label: "ชื่อโครงการ", token: "contrast-target" },
    };
    sendState(readyState);
    const readable = (element: Element, minimum = 4.5) => {
      const computed = getComputedStyle(element);
      expect(
        contrast(rgb(computed.color), backgroundOf(element))
      ).toBeGreaterThanOrEqual(minimum);
    };
    const surface = screen.getByRole("main", { name: "เลือกชื่อโครงการ PDMS" });
    readable(surface);
    const query = screen.getByRole<HTMLInputElement>("combobox");
    readable(query);
    const trigger = screen.getByRole("button", { name: "เลือกชื่อโครงการ" });
    expect(trigger).toBeVisible();
    expect(trigger).toHaveTextContent("เลือกชื่อโครงการ ▼");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const [firstName] = screen.getAllByRole("option");
    expect(getComputedStyle(firstName).height).toBe("auto");
    expect(getComputedStyle(firstName).whiteSpace).toBe("normal");
    sendState({ ...readyState, preview: true });
    expect(firstName).not.toBeInTheDocument();
    const [previewName] = screen.getAllByRole("option");
    expect(previewName).toBeDisabled();
    expect(getComputedStyle(previewName).opacity).toBe("1");
    readable(previewName);
    sendState(readyState);
    for (const control of document.querySelectorAll("button")) {
      if (!control.hidden) {
        readable(control);
      }
    }
    query.focus();
    const focus = getComputedStyle(query);
    expect(
      contrast(rgb(focus.outlineColor), rgb(focus.backgroundColor))
    ).toBeGreaterThanOrEqual(3);
    sendState({ ...readyState, busy: true });
    const disabled = getComputedStyle(query);
    const opacity = Number(disabled.opacity);
    const surfaceColor = rgb(getComputedStyle(surface).backgroundColor);
    const blend = (color: string) =>
      rgb(color).map(
        (channel, index) =>
          channel * opacity + surfaceColor[index] * (1 - opacity)
      );
    expect(query.disabled).toBe(true);
    expect(
      contrast(blend(disabled.color), blend(disabled.backgroundColor))
    ).toBeGreaterThanOrEqual(3);
    sendState({ ...readyState, catalog: { status: "failed" } });
    readable(screen.getByRole("button", { name: "ลองโหลดรายการอีกครั้ง" }));
    sendState(readyState);
    screen.getByRole("button", { name: "ยกเลิกการค้นหา" }).click();
    readable(screen.getByRole("button", { name: "เลือกชื่อโครงการ" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
);
