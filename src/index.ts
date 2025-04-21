import type { ExecutionContext, ScheduledController, ScheduledEvent } from '@cloudflare/workers-types';

export interface Env {
    API_LIST: string; // JSON 字串格式的 API 陣列
    MAX_RETRIES: string; // 數字字串：最大重試次數
    RETRY_INTERVAL: string; // 數字字串：重試間隔（毫秒）
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const callApiWithRetry = async (
    url: string,
    maxRetries: number,
    retryInterval: number,
    timeoutMs = 10000,
): Promise<boolean> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const res = await fetch(url, { method: 'GET', signal: controller.signal });
            clearTimeout(timeout);

            if (res.ok) {
                console.log(`✅ [Attempt ${attempt}] ${url} responded successfully.`);
                return true;
            } else {
                console.warn(`⚠️ [Attempt ${attempt}] ${url} returned status: ${res.status}`);
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.error(`⏱️ [Attempt ${attempt}] ${url} request timed out.`);
            } else {
                console.error(`❌ [Attempt ${attempt}] ${url} failed:`, err);
            }
        }

        if (attempt < maxRetries) {
            await sleep(retryInterval);
        }
    }

    console.error(`❌ Failed to reach ${url} after ${maxRetries} attempts.`);
    return false;
};

export default {
    async scheduled(controller: ScheduledController, event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        const apiList: string[] = JSON.parse(env.API_LIST || '[]');
        const maxRetries = Number.parseInt(env.MAX_RETRIES || '3', 10);
        const retryInterval = Number.parseInt(env.RETRY_INTERVAL || '10000', 10);

        console.log('⏰ Scheduled task started for API_LIST, ', apiList);

        for (const url of apiList) {
            const success = await callApiWithRetry(url, maxRetries, retryInterval);
            if (!success) {
                console.error(`🔥 Giving up on ${url}`);
            }
        }

        console.log('✅ All API ping tasks finished.');
    },
};
