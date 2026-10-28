import {
  Bot, Network, Receipt, Search, BookOpen, Database, Folder, Plug, Github, Slack, Globe, Wrench, Brain, Shield,
  Sparkles, Headphones, Code2, Mail, FileText, type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  bot: Bot, network: Network, receipt: Receipt, search: Search, "book-open": BookOpen, database: Database,
  folder: Folder, plug: Plug, github: Github, slack: Slack, globe: Globe, wrench: Wrench, brain: Brain,
  shield: Shield, sparkles: Sparkles, headphones: Headphones, code: Code2, mail: Mail, file: FileText,
};
export const AGENT_ICON_CHOICES = ["bot", "network", "receipt", "search", "book-open", "headphones", "code", "mail", "brain", "sparkles", "shield", "file"];
export const Icon = ({ name, size = 18 }: { name: string; size?: number }) => {
  const C = ICONS[name] || Bot;
  return <C size={size} aria-hidden />;
};
