interface StatsCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: "red" | "blue" | "green" | "purple";
}

const colorClasses = {
  red: "bg-red-900/20 border-red-800/40 text-red-400",
  blue: "bg-blue-900/20 border-blue-800/40 text-blue-400",
  green: "bg-green-900/20 border-green-800/40 text-green-400",
  purple: "bg-purple-900/20 border-purple-800/40 text-purple-400",
};

export default function StatsCard({
  title,
  value,
  subtitle,
  icon,
  color = "blue",
}: StatsCardProps) {
  return (
    <div className={`border rounded-xl p-5 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">
            {title}
          </p>
          <p className="text-3xl font-black text-white">{value.toLocaleString()}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="text-2xl opacity-50">{icon}</div>}
      </div>
    </div>
  );
}
