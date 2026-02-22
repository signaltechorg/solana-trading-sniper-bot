import { LogsRepository } from '../../repository';

export class LogsHttp {
  constructor(private logsRepository: LogsRepository) {}

  async getLogsPageVariables(request: any, response: any): Promise<any> {
    let excludeLevels: string[] = request.query.exclude_levels || [];
    // Ensure it's always an array (Express sends single value as string)
    if (typeof excludeLevels === 'string') {
      excludeLevels = [excludeLevels];
    }

    if (excludeLevels.length === 0 && !('filters' in request.cookies)) {
      excludeLevels = ['debug'];
    }

    response.cookie('filters', excludeLevels, {
      maxAge: 60 * 60 * 24 * 30 * 1000
    });

    return {
      logs: await this.logsRepository.getLatestLogs(excludeLevels),
      levels: await this.logsRepository.getLevels(),
      form: {
        excludeLevels: excludeLevels
      }
    };
  }
}
