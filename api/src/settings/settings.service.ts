import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface Pillar {
  name: string;
  pct: number;
}

export interface SystemConfigData {
  pillars: Pillar[];
  weeklyBatchDay: number;    // 0=Sun … 6=Sat
  weeklyBatchHour: number;
  weeklyBatchMinute: number;
  blogBatchDay: number;      // 0=Sun … 6=Sat
  blogBatchHour: number;
  blogBatchMinute: number;
  dailyNewsHour: number;
  dailyNewsMinute: number;
  vnResearchWeight: number;  // 0–100: % weight given to Tony's voice notes vs Riley's research
}

const DEFAULTS: SystemConfigData = {
  pillars: [
    { name: 'RWA Tokenization', pct: 30 },
    { name: 'Fundamentals', pct: 25 },
    { name: 'News & Intel', pct: 20 },
    { name: "Builder's Playbook", pct: 15 },
    { name: 'Industry & DeFi', pct: 10 },
  ],
  weeklyBatchDay: 6,
  weeklyBatchHour: 5,
  weeklyBatchMinute: 0,
  blogBatchDay: 2,
  blogBatchHour: 8,
  blogBatchMinute: 30,
  dailyNewsHour: 7,
  dailyNewsMinute: 0,
  vnResearchWeight: 80,
};


@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) { }

  async getConfig(): Promise<SystemConfigData> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { id: 'singleton' },
    });
    if (!row) return DEFAULTS;
    return { ...DEFAULTS, ...(row.data as Partial<SystemConfigData>) };
  }

  async updateConfig(patch: Partial<SystemConfigData>): Promise<SystemConfigData> {
    const current = await this.getConfig();
    const merged = { ...current, ...patch };

    await this.prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', data: merged as any },
      update: { data: merged as any },
    });

    return merged;
  }

  /** Cron expression for the weekly batch based on current config */
  async getWeeklyCron(): Promise<string> {
    const cfg = await this.getConfig();
    return `${cfg.weeklyBatchMinute} ${cfg.weeklyBatchHour} * * ${cfg.weeklyBatchDay}`;
  }

  /** Cron expression for the daily news scan based on current config */
  async getDailyNewsCron(): Promise<string> {
    const cfg = await this.getConfig();
    return `${cfg.dailyNewsMinute} ${cfg.dailyNewsHour} * * 1-5`;
  }

  /** Cron expression for the blog batch based on current config */
  async getBlogCron(): Promise<string> {
    const cfg = await this.getConfig();
    return `${cfg.blogBatchMinute} ${cfg.blogBatchHour} * * ${cfg.blogBatchDay}`;
  }
}
