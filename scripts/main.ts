import { BigNumber } from 'ethers';
import { DateTime } from 'luxon';
import _ from 'underscore';

import rawSwapDatas from './data/swap-result.json';
import { normalizeRawRC, queryAllPositions, RC } from './helper';

const WTIME_INF = 2 ** 31 - 1;
const ACCOUNT = '0x64627901dadb46ed7f275fd4fc87d086cff1e6e3'.toLowerCase();
async function main() {
    const votingDatas = await queryAllPositions(WTIME_INF);
    const swapDatas: RC = normalizeRawRC(rawSwapDatas);

    let sumReward = BigNumber.from(0);
    const rewardList: any = [];
    for (const id in swapDatas) {
        const [pool, _week] = id.split('-');
        const wTime = parseInt(_week);

        if (!votingDatas[pool] || !votingDatas[pool][ACCOUNT]) continue;

        const rewardAmount = swapDatas[id];
        let totalVotingPower = BigNumber.from(0);

        for (const user of Object.keys(votingDatas[pool])) {
            const userVotingPower = votingDatas[pool][user].valueAt(wTime);
            totalVotingPower = totalVotingPower.add(userVotingPower);
        }

        const accountShare = votingDatas[pool][ACCOUNT].valueAt(wTime);
        if (accountShare.eq(0)) continue;
        const rewardForAccount = rewardAmount.mul(accountShare).div(totalVotingPower);

        rewardList.push({ pool, wTime, rewardForAccount: Number(rewardForAccount?.toString()) });

        sumReward = sumReward.add(rewardForAccount);
    }

    const groupMap = _.groupBy(rewardList, 'wTime');
    const resultList = Object.fromEntries(Object.entries(groupMap).map(([wTime, rewards]) => {
        const time = DateTime.fromMillis(Number(wTime) * 1e3)?.toUTC()?.setLocale('en')?.toLocaleString(DateTime.DATE_SHORT);
        const list = rewards?.map(({ pool, rewardForAccount }) => (`${pool} ${rewardForAccount}`));

        return [time, list];
    }));

    console.log(resultList);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
