import { useState, useCallback } from "react";
import type { IptvChannel } from "@/lib/iptv-api";
import { ChannelInitial, LiveBadge } from "./ChannelBadge";

export default function ChannelRow({
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
  const handleClick = useCallback(() => {
    if (!isOffline) onSelect(channel);
  }, [channel, isOffline, onSelect]);

  return (
    <button
      onClick={handleClick}
      disabled={isOffline}
      className={[
        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all group",
        isSelected
          ? "bg-brand-red/15 border-l-2 border-brand-red"
          : "border-l-2 border-transparent hover:bg-brand-surface",
        isOffline ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-brand-surface border border-brand-border">
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
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p
            className={[
              "text-sm font-semibold truncate flex-1 transition-colors",
              isSelected ? "text-white" : "text-gray-300 group-hover:text-white",
            ].join(" ")}
          >
            {channel.name}
          </p>
          <LiveBadge offline={isOffline} />
        </div>
        <p className="text-[11px] text-gray-500 truncate">
          {channel.group}
          {channel.country ? ` · ${channel.country}` : ""}
        </p>
      </div>
    </button>
  );
}
