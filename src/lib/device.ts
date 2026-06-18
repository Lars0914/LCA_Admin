import {
  supportsDirectoryPickerApi,
  supportsMultiFolderPicker,
} from "./explorer";

/** Touch-first / narrow layouts — optimize upload UX for phones. */
export function isMobileUploadDevice(): boolean {
  if (typeof window === "undefined") return false;

  const narrow = window.matchMedia("(max-width: 768px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const mobileUa = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);

  return mobileUa || (narrow && coarse);
}

/** iOS does not support folder directory inputs; hide folder upload there. */
export function supportsFolderUploadOnDevice(): boolean {
  if (typeof navigator === "undefined") return false;

  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIos) return false;

  return supportsMultiFolderPicker() || supportsDirectoryPickerApi();
}

/** Opens the native photo library / files app with multi-select on mobile. */
export const MOBILE_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
