import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The brand mark: a belt with one stripe, in crimson on gi canvas. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F6F5F1",
        }}
      >
        <div
          style={{
            width: 24,
            height: 10,
            borderRadius: 3,
            background: "#A63B32",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 3,
          }}
        >
          <div style={{ width: 3, height: 10, background: "#F6F5F1" }} />
        </div>
      </div>
    ),
    size,
  );
}
