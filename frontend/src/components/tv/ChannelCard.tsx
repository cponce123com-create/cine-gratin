import { useState, useRef, useCallback } from "react";
import type { IptvChannel } from "@/lib/iptv-api";
import { ChannelInitial, LiveBadge } from "./ChannelBadge";

export default function ChannelCard({
  channel,
  isSelected,
  isOffline,
  onSelect,
}: {
  channel: IptvChannel;
  isSelected: boolean;
  isOffline: boolean;
  onSelect: (ch: IptvChannel) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const touchFiredRef = useRef(false);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (isOffline) return;
      touchFiredRef.current = true;
      onSelect(channel);
      setTimeout(() => {
        touchFiredRef.current = false;
      }, 500);
    },
    [channel, isOffline, onSelect],
  );

  const handleClick = useCallback(() => {
    if (touchFiredRef.current) return;
    if (isOffline) return;
    onSelect(channel);
  }, [channel, isOffline, onSelect]);

  return (
    <button
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      disabled={isOffline}
      className={[
        "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all border",
        isSelected
          ? "bg-brand-red/10 border-brand-red ring-2 ring-brand-red ring-offset-1 ring-offset-brand-dark"
          : "bg-brand-card border-brand-border",
        isOffline ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="w-full aspect-square rounded-lg overflow-hidden bg-brand-surface border border-brand-border/50">
        {!logoFailed && channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            loading="lazy"
            className="w-full h-full object-contain"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <ChannelInitial name={channel.name} />
        )}
      </div>
      <p className="text-[10px] font-semibold text-gray-300 text-center w-full truncate leading-tight px-0.5">
        {channel.name}
      </p>
      <LiveBadge offline={isOffline} />
    </button>
  );
}
