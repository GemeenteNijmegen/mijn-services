import { AWS } from '@gemeentenijmegen/utils';
import { logger } from '../Shared/Logger';
import { Submission, SubmissionSchema } from '../Shared/model/Submisison';

export interface ISubmissionStorage {
  getFormJson(reference: string, userId: string, userType: 'person' | 'organization'): Promise<Submission>;
}

export class SubmissionStorage implements ISubmissionStorage {
  private endpoint?: string;
  private apiKey?: string;
  constructor(
    private readonly endpointSsm?: string,
    private readonly apiKeySecretArn?: string,
  ) { }


  private async getConfig() {
    if (!this.endpoint || !this.apiKey) {
      this.endpoint = await AWS.getParameter(this.endpointSsm ?? process.env.FORM_SUBMISSIONS_API_ENDPOINT_SSM!);
      this.apiKey = await AWS.getSecret(this.apiKeySecretArn ?? process.env.FORM_SUBMISSIONS_API_KEY_ARN!);
    }
    return {
      endpoint: this.endpoint,
      apiKey: this.apiKey,
    };
  }

  /**
   * Retreives a submission from the submission storage
   * @param reference The form reference to retreive the submission
   * @returns
   */
  async getFormJson(reference: string, userId: string, userType: 'person' | 'organization'): Promise<Submission> {
    const config = await this.getConfig();
    const url = `${config.endpoint}/${reference}?user_id=${userId}&user_type=${userType}&full_submission=true`;
    const formJson = await this.callApi('GET', url);
    return SubmissionSchema.parse(await formJson.json());
  }

  private async callApi(method: string, url: string, options?: RequestInit) {
    const config = await this.getConfig();

    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'x-api-key': `${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        ...options,
      });

      if (!response.ok) {
        const responseBody = await response.text();
        const statusCode = response.status.toString();
        logger.error('Request failed for url', { statusCode, response: responseBody });
        throw Error('Request failed');
      }
      return response;
    } catch (error) {
      logger.error('FromSubmissions API call failed', error as Error);
      throw Error('FromSubmissions request failed');
    }

  }
}