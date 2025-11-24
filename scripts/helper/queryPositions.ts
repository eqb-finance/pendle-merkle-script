import request, { gql } from 'graphql-request';
import { PoolsData, UserVeBalanceList } from './types';
import { BigNumber as BN, BigNumberish } from 'ethers';
import { getWeekEndTimestamp, getWeekStartTimestamp } from './misc';

const URL = 'https://api.subgraph.ormilabs.com/api/public/9abd747f-98f7-4801-bf60-de5b33db1598/subgraphs/pendle-finance/core-mainnet/nov07/gn';
const vePendle = '0x4f30a9d41b80ecc5b94306ab4364951ae3170210';
const _104_WEEKS = 104 * 7 * 24 * 60 * 60;

const votingPositionQuery = gql`
    query VotePositionQuery($timestampTo: Int!, $synchingIndexFrom: Int!) {
        votingEvents(
            first: 1000
            where: { timestamp_lt: $timestampTo, syncingIndex_gte: $synchingIndexFrom }
            orderBy: syncingIndex
            orderDirection: asc
        ) {
            user
            bias
            slope
            timestamp
            pool
            syncingIndex
        }
    }
`;

const vePendlePositionQuery = gql`
    query LockPositionQuery($timestampTo: Int!, $synchingIndexFrom: Int!) {
        lockingEvents(
            first: 1000
            where: { timestamp_lt: $timestampTo, action: "LOCK", syncingIndex_gte: $synchingIndexFrom }
            orderBy: syncingIndex
            orderDirection: asc
        ) {
            user
            amount
            timestamp
            expiry
            syncingIndex
        }
    }
`;

async function queryVotePositions(timestampTo: number): Promise<PoolsData> {
    type VotePositionSubgraphData = {
        user: string;
        bias: BN;
        slope: BN;
        timestamp: number;
        pool: string;
    };

    let datas: VotePositionSubgraphData[] = [];

    for (let synchingIndexFrom = 0; ; ) {
        const rawDatas: any = await request(URL, votingPositionQuery, { timestampTo, synchingIndexFrom });
        for (const raw of rawDatas.votingEvents) {
            datas.push({
                pool: raw.pool,
                user: raw.user,
                bias: BN.from(raw.bias),
                slope: BN.from(raw.slope),
                timestamp: parseInt(raw.timestamp),
            });
        }

        if (rawDatas.votingEvents.length < 1000) break;
        synchingIndexFrom = parseInt(rawDatas.votingEvents[999].syncingIndex);
    }

    const poolsData: PoolsData = {};
    for (const data of datas) {
        if (!poolsData[data.pool]) poolsData[data.pool] = {};
        if (!poolsData[data.pool][data.user]) poolsData[data.pool][data.user] = new UserVeBalanceList();
        poolsData[data.pool][data.user].addSnapshot(data.slope, data.bias, getWeekEndTimestamp(data.timestamp));
    }

    return poolsData;
}

async function queryLockPositions(timestampTo: number): Promise<PoolsData> {
    type LockPositionSubgraphData = {
        user: string;
        amount: BN;
        expiry: BN;
        timestamp: number;
    };

    let datas: LockPositionSubgraphData[] = [];

    for (let synchingIndexFrom = 0; ; ) {
        const rawDatas: any = await request(URL, vePendlePositionQuery, { timestampTo, synchingIndexFrom });
        for (const raw of rawDatas.lockingEvents) {
            datas.push({
                user: raw.user,
                amount: BN.from(raw.amount),
                expiry: BN.from(raw.expiry),
                timestamp: parseInt(raw.timestamp),
            });
        }
        if (rawDatas.lockingEvents.length < 1000) break;
        synchingIndexFrom = parseInt(rawDatas.lockingEvents[999].syncingIndex);
    }

    const poolsData: PoolsData = {};
    for (const data of datas) {
        if (!poolsData[vePendle]) poolsData[vePendle] = {};
        if (!poolsData[vePendle][data.user]) poolsData[vePendle][data.user] = new UserVeBalanceList();

        const slope = data.amount.div(_104_WEEKS);
        const bias = slope.mul(data.expiry);
        poolsData[vePendle][data.user].addSnapshot(slope, bias, getWeekEndTimestamp(data.timestamp));
    }

    return poolsData;
}

export async function queryAllPositions(to: number): Promise<PoolsData> {
    const votePositions = await queryVotePositions(to);
    const lockPositions = await queryLockPositions(to);

    const poolsData: PoolsData = {};
    for (const pool of Object.keys(votePositions)) {
        poolsData[pool] = votePositions[pool];
    }
    poolsData[vePendle] = lockPositions[vePendle];
    return poolsData;
}
