interface LogoProps {
  size?: 'sm' | 'lg'
}

export default function Logo({ size = 'lg' }: LogoProps) {
  const isLarge = size === 'lg'

  return (
    <div className={`flex flex-col items-center ${isLarge ? 'gap-4' : 'gap-2'}`}>
      <div
        className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/30 ${
          isLarge ? 'h-20 w-20' : 'h-12 w-12'
        }`}
      >
        <svg
          className={isLarge ? 'h-10 w-10 text-white' : 'h-6 w-6 text-white'}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
      </div>
      {isLarge && (
        <p className="text-xs tracking-widest text-blue-300/70 uppercase">Logo 占位区</p>
      )}
    </div>
  )
}
