import { mapIconUrl } from '../utils/mapIcon';

type Props = {
  map: string;
  /** Width in px (height auto for aspect ratio) */
  width?: number;
  height?: number;
  className?: string;
  rounded?: string;
  /** Fill the parent's width with auto height. Overrides width/height. */
  fill?: boolean;
};

export default function MapIcon({
  map,
  width = 32,
  height,
  className,
  rounded = 'rounded',
  fill,
}: Props) {
  const url = mapIconUrl(map);
  const fillCls = fill ? 'block w-full h-auto' : '';
  const style = fill ? undefined : height ? { width, height } : { width };
  if (!url) {
    return (
      <span
        className={`inline-flex items-center justify-center ${rounded} bg-white/5 text-[10px] text-valorant-muted ${fillCls} ${className ?? ''}`}
        style={
          fill
            ? { aspectRatio: '16 / 9', width: '100%' }
            : { width, height: height ?? width }
        }
        title={map}
      >
        ?
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={map}
      title={map}
      className={`${rounded} object-cover bg-valorant-panel2 ${fillCls} ${className ?? ''}`}
      style={style}
    />
  );
}
