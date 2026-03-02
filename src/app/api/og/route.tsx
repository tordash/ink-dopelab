import { ImageResponse } from "next/og";

export const runtime = "edge";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://ink.dopelab.studio";

async function loadFont(
  family: string,
  weight: number = 400
): Promise<ArrayBuffer> {
  const api = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const css = await fetch(api, {
    headers: {
      // Old Safari UA → Google Fonts returns TrueType format
      "User-Agent":
        "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
    },
  }).then((res) => res.text());

  const match = css.match(/src: url\((.+?)\)/);
  if (!match?.[1]) throw new Error(`Font CSS parse failed: ${family}`);

  return fetch(match[1]).then((res) => res.arrayBuffer());
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "INK by DopeLab";
  const locale = searchParams.get("locale") || "th";
  const category = searchParams.get("category") || "";

  let fonts: { name: string; data: ArrayBuffer; style: "normal" }[] = [];

  try {
    const [leagueSpartan, kanit] = await Promise.all([
      loadFont("League Spartan", 700),
      loadFont("Kanit", 700),
    ]);
    fonts = [
      { name: "League Spartan", data: leagueSpartan, style: "normal" },
      { name: "Kanit", data: kanit, style: "normal" },
    ];
  } catch {
    // Fallback: render without custom fonts
  }

  const titleFont = locale === "th" ? "Kanit" : "League Spartan";
  const titleSize = title.length > 40 ? 48 : 56;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #191919 0%, #222222 50%, #191919 100%)",
          position: "relative",
        }}
      >
        {/* Top gradient accent bar */}
        <div
          style={{
            width: "100%",
            height: "6px",
            background: "linear-gradient(90deg, #000000 0%, #FFCC00 50%, #000000 100%)",
            display: "flex",
          }}
        />

        {/* Content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 80px",
            gap: "24px",
          }}
        >
          {/* Category pill */}
          {category && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  backgroundColor: "rgba(255, 204, 0, 0.2)",
                  border: "1px solid rgba(255, 204, 0, 0.4)",
                  borderRadius: "20px",
                  padding: "6px 16px",
                  fontSize: "16px",
                  color: "#FFD633",
                  display: "flex",
                }}
              >
                {category}
              </div>
            </div>
          )}

          {/* Title */}
          <div
            style={{
              fontSize: titleSize,
              fontFamily: titleFont,
              fontWeight: 700,
              color: "#F1F5F9",
              lineHeight: 1.2,
              display: "flex",
              maxWidth: "900px",
            }}
          >
            {title}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 80px 40px",
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: "#FFCC00",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#1A1A1A",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              INK
            </div>
            <div
              style={{
                fontSize: "18px",
                color: "#94A3B8",
                display: "flex",
              }}
            >
              INK by DopeLab
            </div>
          </div>

          {/* URL */}
          <div
            style={{
              fontSize: "16px",
              color: "#718BA0",
              display: "flex",
            }}
          >
            {SITE_URL.replace("https://", "")}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}
