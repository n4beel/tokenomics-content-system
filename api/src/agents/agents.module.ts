import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentClientService } from './agent-client.service';

@Module({
  imports: [ConfigModule],
  providers: [AgentClientService],
  exports: [AgentClientService],
})
export class AgentsModule {}
