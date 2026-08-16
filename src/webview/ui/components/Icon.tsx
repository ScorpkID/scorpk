import { SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function base(props: IconProps) {
  const { size = 16, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export function IconFile(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v10A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-12z" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6 7l1 13a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20L18 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconTerminal(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="1.6" />
      <path d="M7 9.5l3 2.5-3 2.5" />
      <path d="M13 15h4" />
    </svg>
  );
}

export function IconGitBranch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="9" r="2" />
      <path d="M6 7v10" />
      <path d="M6 12c0-3 3-5 6-5h4" />
    </svg>
  );
}

export function IconWrench(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.7 6.3a4 4 0 0 0-5.6 4.6L3 17v4h4l6.1-6.1a4 4 0 0 0 4.6-5.6l-2.6 2.6-2-2 2.6-2.6z" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5.5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v1" />
    </svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.5 18-4-8-8-4L21 3z" />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </svg>
  );
}

export function IconHand(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 12V5a1.4 1.4 0 0 1 2.8 0v6" />
      <path d="M11.8 11V4a1.4 1.4 0 0 1 2.8 0v7" />
      <path d="M14.6 11.3V5.6a1.4 1.4 0 0 1 2.8 0V13" />
      <path d="M17.4 9.6a1.4 1.4 0 0 1 2.8 0V15c0 4-2.6 7-6.8 7-3 0-4.4-1-6-2.8l-3.4-4a1.5 1.5 0 0 1 2.3-1.9l1.7 1.6" />
    </svg>
  );
}

export function IconListChecks(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 6l1.3 1.3L7 5" />
      <path d="M3.5 12l1.3 1.3L7 11" />
      <path d="M3.5 18l1.3 1.3L7 17" />
      <path d="M11 6h9.5M11 12h9.5M11 18h9.5" />
    </svg>
  );
}

export function IconZap(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

export function IconMessage(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-5 4v-4.5A1.5 1.5 0 0 1 4 14.5z" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <circle cx="17" cy="8.5" r="2.6" />
      <path d="M15.5 14.7c2.4.3 4.2 2.3 4.5 5.3" />
    </svg>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h10M17 6h3M4 12h3M9 12h11M4 18h13M20 18h0" />
      <circle cx="12.5" cy="6" r="2" />
      <circle cx="6.5" cy="12" r="2" />
      <circle cx="16.5" cy="18" r="2" />
    </svg>
  );
}

export function IconScorpion(props: IconProps) {
  return (
    <svg {...base(props)} strokeWidth={1.5}>
      <path d="M4.2 19c3.6 0 6.3-1.9 6.3-4.8s-2.4-4.6-4.3-3.7" />
      <path d="M6.2 10.5c2.5-1 3.8-3.4 2.7-5.9-1-2.2.7-4 2.8-3.6" />
      <path d="M11.7 1l1.9.5-.7 1.9" />
      <circle cx="4.2" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H4.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1-1.56V4.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z" />
    </svg>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.3a2.4 2.4 0 1 1 3.4 2.2c-.9.5-1.4 1-1.4 2" />
      <path d="M12 16.8v.1" />
    </svg>
  );
}

export function IconPaperclip(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 12.5l6.5-6.5a3 3 0 0 1 4.2 4.2L11 18a5 5 0 0 1-7-7l7.5-7.5" />
    </svg>
  );
}

export function IconCode(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 8l-4.5 4 4.5 4" />
      <path d="M15 8l4.5 4-4.5 4" />
    </svg>
  );
}

export function IconGithub(props: IconProps) {
  const { size = 16 } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function IconGoogle(props: IconProps) {
  const { size = 16 } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

export function IconHuggingFace(props: IconProps) {
  const { size = 16 } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10c0 .5-.4 1-1 1s-1-.5-1-1 .4-1 1-1 1 .5 1 1z" fill="currentColor" stroke="none" />
      <path d="M17 10c0 .5-.4 1-1 1s-1-.5-1-1 .4-1 1-1 1 .5 1 1z" fill="currentColor" stroke="none" />
      <path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
    </svg>
  );
}

export function IconCopilot(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2l2.4 4.9L20 8l-4 3.9.9 5.5L12 14.9 7.1 17.4 8 11.9 4 8l5.6-1.1L12 2z" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </svg>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.3 3.9a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.7-3.1l8-14z" />
      <path d="M12 9.5v4M12 17v.1" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconLoader(props: IconProps) {
  return (
    <svg {...base(props)} className={`icon-spin ${props.className ?? ''}`}>
      <path d="M12 3.5V7" opacity="1" />
      <path d="M12 17v3.5" opacity="0.3" />
      <path d="M6 6l2.5 2.5" opacity="0.5" />
      <path d="M15.5 15.5L18 18" opacity="0.2" />
      <path d="M3.5 12H7" opacity="0.7" />
      <path d="M17 12h3.5" opacity="0.4" />
      <path d="M6 18l2.5-2.5" opacity="0.8" />
      <path d="M15.5 8.5L18 6" opacity="0.6" />
    </svg>
  );
}
