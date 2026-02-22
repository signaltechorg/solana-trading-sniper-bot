import { LogsRepository } from '../../repository';

export class LogsHttp {
  constructor(private logsRepository: LogsRepository) {}

  async getLogsPageVariables(request: any, response: any): Promise<any> {
    // Check for query params (support both exclude_levels and exclude_levels[])
    let excludeLevels: string[] = request.query.exclude_levels || request.query['exclude_levels[]'] || ['debug'];

    // Ensure it's always an array (Express sends single value as string)
    if (typeof excludeLevels === 'string') {
      excludeLevels = [excludeLevels];
    }

    return {
      logs: await this.logsRepository.getLatestLogs(excludeLevels),
      levels: await this.logsRepository.getLevels(),
      form: {
        excludeLevels: excludeLevels
      }
    };
  }
}
