import { ImageResponse } from "next/og";

/**
 * The tab icon: the pennant from the icon set, in turf on pitch. Generated rather
 * than shipped as a binary so it stays in step with the palette, and present at
 * all because a missing favicon is a 404 in every visitor's console.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#121711",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 20 20"
          fill="none"
          stroke="#4A8A3C"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5.25 3v14.25" />
          <path d="M5.25 3.75h10.5l-3 3.5 3 3.5H5.25z" />
        </svg>
      </div>
    ),
    size,
  );
}
