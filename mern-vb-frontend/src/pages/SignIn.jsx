import { SignIn } from '@clerk/clerk-react';

const clerkAppearance = {
  variables: {
    colorPrimary: '#C8501A',
    colorBackground: '#ffffff',
    borderRadius: '8px',
    fontFamily: 'inherit',
  },
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none border-0 p-0 bg-transparent',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    footer: 'hidden',
  },
};

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans">
      {/* LEFT PANEL — branding (desktop only) */}
      <aside
        className="hidden md:flex relative overflow-hidden md:w-1/2 lg:w-[45%] px-12 py-10"
        style={{ backgroundColor: '#1E1A16' }}
      >
        {/* Decorative orange circles */}
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            backgroundColor: '#C8501A',
            width: 220,
            height: 220,
            top: -80,
            left: -80,
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            backgroundColor: '#C8501A',
            width: 180,
            height: 180,
            bottom: -60,
            right: -60,
          }}
        />

        {/* Content stack */}
        <div className="relative z-10 flex flex-col justify-between w-full">
          {/* Wordmark top-left */}
          <div
            className="text-white"
            style={{ fontSize: 15, fontWeight: 500 }}
          >
            Chama360
          </div>

          {/* Centred testimonial block */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <p
              className="uppercase"
              style={{
                color: '#C8501A',
                fontSize: 11,
                letterSpacing: '0.1em',
                marginBottom: 20,
              }}
            >
              Built for treasurers. Loved by members.
            </p>
            <blockquote
              className="text-white"
              style={{
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1.25,
                marginBottom: 28,
              }}
            >
              &ldquo;Our meetings used to start with arguments. Now we just open the app.&rdquo;
            </blockquote>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-full text-white"
                style={{
                  backgroundColor: '#C8501A',
                  width: 36,
                  height: 36,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                WM
              </div>
              <div className="flex flex-col">
                <span
                  className="text-white"
                  style={{ fontSize: 13, fontWeight: 500 }}
                >
                  William M.
                </span>
                <span style={{ color: '#A89080', fontSize: 12 }}>
                  Treasurer, William&apos;s Village Bank &middot; Lusaka
                </span>
              </div>
            </div>
          </div>

          {/* Spacer to keep content vertically balanced */}
          <div aria-hidden />
        </div>
      </aside>

      {/* RIGHT PANEL — sign-in form */}
      <main className="flex-1 flex items-center justify-center bg-white px-6 py-10 md:px-12">
        <div className="w-full max-w-md">
          {/* Mobile-only wordmark (left panel is hidden on mobile) */}
          <div
            className="md:hidden mb-8 text-text-primary"
            style={{ fontSize: 18, fontWeight: 700 }}
          >
            Chama360
          </div>

          <p
            className="uppercase"
            style={{
              color: '#C8501A',
              fontSize: 11,
              letterSpacing: '0.1em',
              marginBottom: 14,
            }}
          >
            Free 15-day trial
          </p>
          <h1
            className="text-text-primary"
            style={{
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: 12,
            }}
          >
            Your Village Bank deserves better than a spreadsheet.
          </h1>
          <p
            className="text-text-secondary"
            style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}
          >
            Track savings, calculate loans, and let every member check their own balance &mdash; without calling the treasurer.
          </p>

          <SignIn
            routing="path"
            path="/sign-in"
            afterSignInUrl="/dashboard"
            afterSignUpUrl="/dashboard"
            appearance={clerkAppearance}
          />
        </div>
      </main>
    </div>
  );
}
