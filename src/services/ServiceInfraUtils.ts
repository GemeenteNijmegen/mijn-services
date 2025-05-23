export class ServiceInfraUtils {
  static frontendHealthCheck(port: number, timeout = 2) {
    const script = [
      'import requests',
      'import sys',
      'import signal',
      'signal.signal(signal.SIGALRM, lambda s,f: sys.exit(1))',
      `signal.alarm(${timeout})`,
      `x = requests.get('http://localhost:${port}/')`,
      'sys.exit(x.status_code != 200)',
    ].join(';');
    return `python - c "${script}" >> /proc/1/fd/1`
  }
}