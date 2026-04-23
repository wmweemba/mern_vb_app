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

const mobileClerkAppearance = {
  variables: {
    colorPrimary: '#C8501A',
    colorBackground: 'transparent',
    colorInputBackground: '#ffffff',
    colorInputText: '#1E1A16',
    shadowShimmer: 'transparent',
    colorShimmer: 'transparent',
    borderRadius: '8px',
    fontFamily: 'inherit',
    fontSize: '14px',
    spacingUnit: '0.85rem',
  },
  elements: {
    rootBox: {
      width: '100%',
      backgroundColor: 'transparent',
    },
    card: {
      backgroundColor: 'transparent',
      boxShadow: 'none',
      border: 'none',
      padding: '0',
      margin: '0',
      width: '100%',
    },
    headerTitle: { display: 'none' },
    headerSubtitle: { display: 'none' },
    footer: { display: 'none' },
    main: {
      padding: '0',
      gap: '12px',
    },
    socialButtonsBlockButton: {
      border: '1px solid #e5e5e5',
      backgroundColor: '#ffffff',
    },
    formButtonPrimary: {
      backgroundColor: '#C8501A',
    },
    formFieldInput: {
      border: '1px solid #e5e5e5',
      backgroundColor: '#ffffff',
      borderRadius: '8px',
    },
    dividerLine: {
      backgroundColor: '#e5e5e5',
    },
  },
};

export default function SignInPage() {
  return (
    <>
      {/* Safari iOS: prevent grey system background on form inputs */}
      <style>{`
        input[type="email"],
        input[type="text"],
        input[type="password"] {
          -webkit-appearance: none;
          background-color: #ffffff !important;
        }
      `}</style>

      {/* ── MOBILE LAYOUT (below lg / 1024px) ── */}
      <div className="lg:hidden min-h-screen relative overflow-hidden font-sans">
        {/* Layer 1: Split background */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-x-0 top-0"
            style={{ height: '42%', backgroundColor: '#1E1A16' }}
          />
          <div
            className="absolute inset-x-0 bottom-0"
            style={{ height: '58%', backgroundColor: '#FFFFFF' }}
          />
        </div>

        {/* Layer 2: Orange circle accents */}
        <div
          aria-hidden
          className="absolute"
          style={{
            zIndex: 1,
            backgroundColor: '#C8501A',
            opacity: 0.9,
            width: 130,
            height: 130,
            top: -40,
            left: -40,
            borderRadius: '50%',
          }}
        />
        <div
          aria-hidden
          className="absolute"
          style={{
            zIndex: 1,
            backgroundColor: '#C8501A',
            opacity: 0.5,
            width: 80,
            height: 80,
            top: 60,
            right: -30,
            borderRadius: '50%',
          }}
        />

        {/* Layer 3: Wordmark */}
        <div
          className="absolute"
          style={{ zIndex: 2, top: 12, left: 20, color: '#F0EDE8', fontSize: 14, fontWeight: 600 }}
        >
          Chama360
        </div>

        {/* Layer 4: Floating sign-in card */}
        <div
          className="absolute"
          style={{
            zIndex: 3,
            top: '28%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '88%',
            backgroundColor: '#ffffff',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          }}
        >
          <p
            style={{
              color: '#C8501A',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            FREE 15-DAY TRIAL
          </p>
          <h1
            style={{
              color: '#1E1A16',
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: 6,
            }}
          >
            Your Village Bank deserves better than a spreadsheet.
          </h1>
          <p style={{ color: '#888888', fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>
            Track savings, calculate loans, and let every member check their own
            balance &mdash; without calling the treasurer.
          </p>
          <SignIn
            routing="path"
            path="/sign-in"
            afterSignInUrl="/dashboard"
            afterSignUpUrl="/dashboard"
            appearance={mobileClerkAppearance}
          />
        </div>

        {/* Layer 5: Testimonial row */}
        <div
          className="absolute"
          style={{
            zIndex: 2,
            bottom: 20,
            left: 20,
            right: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              backgroundColor: '#C8501A',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            WM
          </div>
          <div>
            <p style={{ color: '#888888', fontSize: 10, fontStyle: 'italic', lineHeight: 1.4, margin: 0 }}>
              &ldquo;Our meetings used to start with arguments. Now we just open the app.&rdquo;
            </p>
            <p style={{ color: '#555555', fontSize: 9, marginTop: 3 }}>
              William M. &middot; Treasurer, Lusaka
            </p>
          </div>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT (lg / 1024px and above) ── */}
      <div className="hidden lg:flex flex-col lg:flex-row font-sans min-h-screen">
        {/* LEFT PANEL — branding */}
        <aside
          className="hidden lg:flex relative overflow-hidden lg:w-1/2 lg:w-[45%] px-12 py-10"
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
        <main className="flex-1 flex items-center justify-center bg-white px-6 py-10 lg:px-12">
          <div className="w-full max-w-md">
            {/* Wordmark shown only if left panel is somehow absent */}
            <div
              className="lg:hidden mb-8 text-text-primary"
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
              Track savings, calculate loans, and let every member check their own
              balance &mdash; without calling the treasurer.
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
    </>
  );
}
