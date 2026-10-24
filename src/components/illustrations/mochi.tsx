export function Mochi({
  size = 74,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Mochi, the English Skill Lab mascot"
    >
      <defs>
        <linearGradient id="mochiFill" x1="0" x2="1" y2="1">
          <stop stopColor="#fffefa" />
          <stop offset="1" stopColor="#c8f5ef" />
        </linearGradient>
      </defs>
      <path
        d="M50 7 62 23 82 24 80 44 92 59 77 70 73 88 51 83 30 91 25 72 9 61 20 44 18 25 39 23Z"
        fill="url(#mochiFill)"
        stroke="#32b7bd"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M26 56c-9-3-12 9-5 15l8 3"
        fill="#936de4"
        stroke="#6043ab"
        strokeWidth="2"
      />
      <path
        d="M74 56c9-3 12 9 5 15l-8 3"
        fill="#936de4"
        stroke="#6043ab"
        strokeWidth="2"
      />
      <circle cx="39" cy="48" r="3.2" fill="#183657" />
      <circle cx="61" cy="48" r="3.2" fill="#183657" />
      <path
        d="M44 59q6 7 12 0"
        fill="none"
        stroke="#183657"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="29" cy="57" rx="5" ry="3" fill="#ffadb5" opacity=".8" />
      <ellipse cx="71" cy="57" rx="5" ry="3" fill="#ffadb5" opacity=".8" />
      <path
        d="M31 76h38v13q-19 7-38 0Z"
        fill="#ffd26b"
        stroke="#d39732"
        strokeWidth="2"
      />
      <path d="M42 75v15m16-15v15" stroke="#d39732" strokeWidth="2" />
    </svg>
  );
}

export function StudyIllustration() {
  return (
    <svg
      viewBox="0 0 390 225"
      className="study-illustration"
      aria-hidden="true"
    >
      <ellipse
        cx="198"
        cy="214"
        rx="183"
        ry="20"
        fill="#73d7d2"
        opacity=".33"
      />
      <path
        d="M21 207q-14-50 9-87 25 34 14 89M40 208q-5-80 29-96 3 58-22 97M346 209q-9-87 28-104 6 61-14 103M361 208q8-62 27-67 4 49-14 68"
        fill="#5cc4aa"
        opacity=".9"
      />
      <path
        d="M17 211h81m245 0h47"
        stroke="#3ba995"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="200" cy="82" r="51" fill="#59332f" />
      <path
        d="M148 88q-17-66 45-68 61-7 66 59-10 3-18-10-23 7-32-20-19 22-61 39Z"
        fill="#603a35"
      />
      <path
        d="M180 127q-38 4-49 36l-12 41h159l-14-49q-14-30-51-29Z"
        fill="#ffbc64"
      />
      <path d="M178 130q21 18 39 0l8 65h-56Z" fill="#ffe2a9" />
      <ellipse cx="196" cy="86" rx="39" ry="47" fill="#ffd7bc" />
      <path
        d="M157 81q-12-55 37-54 44 0 43 56-15-15-18-31-26 18-62 29Z"
        fill="#633a35"
      />
      <path
        d="M171 91q7-5 13 0m31 0q7-5 12 0"
        fill="none"
        stroke="#61352f"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M193 111q6 8 14 0"
        fill="none"
        stroke="#c65f5f"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="169" cy="103" rx="8" ry="4" fill="#ff9e9e" opacity=".7" />
      <ellipse cx="228" cy="103" rx="8" ry="4" fill="#ff9e9e" opacity=".7" />
      <path
        d="M140 161q-23 1-22 40h31l14-23M254 160q21 8 25 39h-36l-12-22"
        fill="#ffbc64"
        stroke="#eaa053"
        strokeWidth="3"
      />
      <path d="M143 200h111l-12-63H155Z" fill="#9385b7" />
      <path d="M154 141h79l10 52h-99Z" fill="#aca0cb" />
      <path d="M187 166q8-9 16 0-8 10-16 0" fill="#ffe6e6" />
      <path d="M294 201h65l-4-17h-58Z" fill="#ed756e" />
      <path d="M303 184h57l-3-15h-53Z" fill="#ffcc65" />
      <path d="M299 169h61l-3-16h-57Z" fill="#4bb6ad" />
      <path d="M303 153h60l-4-15h-56Z" fill="#7895cf" />
      <circle cx="77" cy="54" r="20" fill="#ffcf68" />
      <path
        d="M77 16v10M77 82v10M39 54h10M105 54h10M50 27l7 7m41 41 7 7m0-55-7 7M57 75l-7 7"
        stroke="#ffa62b"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
