import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center bg-[#191919] px-4 text-center">
      {/* Big 404 */}
      <h1 className="mb-2 font-[family-name:var(--font-typewriter)] text-[8rem] font-extrabold leading-none tracking-tight text-[#FFCC00] sm:text-[10rem]">
        404
      </h1>

      {/* Bilingual explanation */}
      <p className="mb-2 text-xl font-semibold text-white sm:text-2xl">
        ไม่พบหน้าที่คุณกำลังมองหา
      </p>
      <p className="mb-8 text-lg text-white/60">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>

      {/* Two buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/th"
          className="inline-flex items-center gap-2 rounded-lg bg-[#FFCC00] px-6 py-3 font-semibold text-[#191919] transition-transform hover:scale-105"
        >
          กลับหน้าแรก
        </Link>
        <Link
          href="/en/blog"
          className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-6 py-3 font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/5"
        >
          Browse Articles
        </Link>
      </div>

      {/* INK branding */}
      <p className="mt-12 font-[family-name:var(--font-typewriter)] text-sm tracking-widest text-white/30">
        INK by DopeLab
      </p>
    </div>
  );
}
