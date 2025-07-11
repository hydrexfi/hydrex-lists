import {
  Strategy,
  ETH_NATIVE_ADDRESS,
  MODERATE_RISK_STRING,
  MODERATE_LOW_RISK_STRING,
} from "../types";
import { USDC, USDC_ICHI, WETH, cbBTC } from "../tokens/84532";

export const strategies: Strategy[] = [
  {
    chainId: 84532,
    title: "ETH/USDC",
    type: "Narrow",
    liquidityType: "uniV4",
    strategist: "Gamma",
    riskLevel: 5,
    riskDescription: MODERATE_RISK_STRING,
    address: "0xdb7608614dfdd9febfc1b82a7609420fa7b3bc34",
    token0Address: ETH_NATIVE_ADDRESS,
    token1Address: USDC.address,
    v4PoolId:
      "0x2a06ec4869b1a21843a99f25a184c71a7a5ea56ed533ec2bf035e1ad50f66483",
  },
  {
    chainId: 84532,
    title: "USDC/cbBTC",
    type: "Narrow",
    liquidityType: "uniV4",
    strategist: "Gamma",
    riskLevel: 5,
    riskDescription: MODERATE_RISK_STRING,
    address: "0x9616052273A598BC04BD1Ad7f7A753157C24f77E",
    token0Address: USDC.address,
    token1Address: cbBTC.address,
    v4PoolId:
      "0x4d4fb0dbfdd83450bc26dcfa9b8627eeee560cf5a7a52731a3a51ab0f2f62db3",
  },
  {
    chainId: 84532,
    title: "USDC/WETH",
    type: "Single Sided",
    liquidityType: "integral",
    strategist: "Ichi",
    riskLevel: 3,
    riskDescription: MODERATE_LOW_RISK_STRING,
    address: "0x0034060c628D988Bf8D34bd2F8ff3fbDc02044BD",
    token0Address: USDC_ICHI.address,
    token1Address: WETH.address,
    depositToken: WETH.address,
  },
];
