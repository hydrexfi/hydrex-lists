import { Badge } from "../types";

const LINK_PREFIX =
  "https://raw.githubusercontent.com/hydrexfi/hydrex-lists/staging/assets/badges";

const Badges: Badge[] = [
  {
    name: "TBA Creator",
    nftId: "37",
    image: `${LINK_PREFIX}/37.png`,
    rewardImage: `${LINK_PREFIX}/37.png`,
    description: "Coin Base App Content",
    fullDescription:
      "Claim this badge by coining a piece of content in the Base App.",
    type: "Activity",
    category: "Based",
    partnerName: "Base App",
    minHydropoints: 0,
    poolSize: 100000,
    maxSupply: 1000,
    externalLink: "https://join.base.app",
  },
  {
    name: "Vote Escrow Maxi",
    nftId: "17",
    image: `${LINK_PREFIX}/17.png`,
    rewardImage: `${LINK_PREFIX}/17.png`,
    description: "Lock veTokens? This is for you.",
    fullDescription:
      "Own a Max-Locked veToken on an existing ve(3,3) protocol? See if you qualify for this badge! Snapshot taken late June 2025.",
    type: "Partner",
    category: "DeFi",
    partnerName: "ve(3,3) Protocols",
    minHydropoints: 1000,
    metric: "Locked veTokens",
  },
  {
    name: "Base Starter",
    nftId: "1",
    image: `${LINK_PREFIX}/1.png`,
    rewardImage: `${LINK_PREFIX}/1.png`,
    description: "Get a Bonus ~100 veHYDX",
    fullDescription:
      "Provide liquidity to acquire 1000+ Hydropoints & become a tier 1 Based Hydrex Member. Max of 100 veHYDX per account.",
    type: "Tier",
    category: "Tier",
    partnerName: "Base",
    minHydropoints: 1000,
    poolSize: 1000000,
  },
  {
    name: "Honest Work",
    nftId: "2",
    image: `${LINK_PREFIX}/2.png`,
    rewardImage: `${LINK_PREFIX}/2.png`,
    description: "Get a Bonus ~400 veHYDX",
    fullDescription:
      "Provide liquidity to acquire 10,000+ Hydropoints & become a tier 2 Based Hydrex Member. Max of 400 veHYDX per account.",
    type: "Tier",
    category: "Tier",
    partnerName: "Base",
    minHydropoints: 10000,
    poolSize: 1000000,
  },
  {
    name: "DeFi Degen",
    nftId: "3",
    image: `${LINK_PREFIX}/3.png`,
    rewardImage: `${LINK_PREFIX}/3.png`,
    description: "Get a Bonus ~1000 veHYDX",
    fullDescription:
      "Provide liquidity to acquire 100,000+ Hydropoints & become a tier 3 Based Hydrex Member. Max of 1,000 veHYDX per account.",
    type: "Tier",
    category: "Tier",
    partnerName: "Base",
    minHydropoints: 100000,
    poolSize: 1000000,
  },
  {
    name: "Master Baser",
    nftId: "4",
    image: `${LINK_PREFIX}/4.png`,
    rewardImage: `${LINK_PREFIX}/4.png`,
    description: "Get a Bonus ~15K veHYDX",
    fullDescription:
      "Provide liquidity to acquire 1,000,000+ Hydropoints & become a tier 4 Based Hydrex Member. Max of 15,000 veHYDX per account.",
    type: "Tier",
    category: "Tier",
    partnerName: "Base",
    minHydropoints: 1000000,
    poolSize: 1500000,
  },
  {
    name: "Based God",
    nftId: "5",
    image: `${LINK_PREFIX}/5.png`,
    rewardImage: `${LINK_PREFIX}/5.png`,
    description: "Get a Bonus ~200K veHYDX",
    fullDescription:
      "Provide liquidity to acquire 10,000,000+ Hydropoints & become the top Tier Based Hydrex Member. Max of 200,000 veHYDX per account.",
    type: "Tier",
    category: "Tier",
    partnerName: "Base",
    minHydropoints: 10000000,
    poolSize: 2000000,
  },
  // {
  //   name: "Clank, Clank",
  //   nftId: "38",
  //   image: `${LINK_PREFIX}/38.png`,
  //   rewardImage: `${LINK_PREFIX}/38.png`,
  //   description: "Use Clanker to Deploy",
  //   fullDescription:
  //     "Claim this badge by using Clanker to deploy a token on Base.",
  //   type: "Partner",
  //   category: "Memes",
  //   partnerName: "Clanker",
  //   minHydropoints: 1000,
  //   poolSize: 250000,
  //   maxSupply: 250,
  //   externalLink: "https://clanker.world",
  // },
  {
    name: "Squad Up",
    nftId: "8",
    image: `${LINK_PREFIX}/8.png`,
    rewardImage: `${LINK_PREFIX}/8.png`,
    description: "Become a Farcaster Hydrex Follower",
    fullDescription:
      "Follow @HydrexFi on Farcaster and claim this with your Farcaster associated account.",
    type: "Activity",
    category: "Social",
    partnerName: "Farcaster",
    minHydropoints: 10,
    poolSize: 500000,
    maxSupply: 2500,
    externalLink: "https://farcaster.xyz/hydrexfi",
  },
  {
    name: "Base Dot ETH",
    nftId: "9",
    image: `${LINK_PREFIX}/9.png`,
    rewardImage: `${LINK_PREFIX}/9.png`,
    description: "For the Basename Hodlers",
    fullDescription:
      "Claim this Badge with an account that has a Basename associated.",
    type: "Activity",
    category: "Based",
    partnerName: "Base",
    minHydropoints: 100,
    poolSize: 1000000,
    maxSupply: 5000,
    externalLink: "https://base.org/names",
  },
  {
    name: "Pretty Smart",
    nftId: "10",
    image: `${LINK_PREFIX}/10.png`,
    rewardImage: `${LINK_PREFIX}/10.png`,
    description: "For Coinbase Smart Wallet Users",
    fullDescription:
      "Claim this Badge with an account that is a funded Coinbase Smart Wallet.",
    type: "Activity",
    category: "Based",
    partnerName: "Base",
    minHydropoints: 1000,
    poolSize: 1000000,
    maxSupply: 1000,
  },
  {
    name: "It's Official",
    nftId: "11",
    image: `${LINK_PREFIX}/11.png`,
    rewardImage: `${LINK_PREFIX}/11.png`,
    description: "Onchain Coinbase Verified Users",
    fullDescription:
      "Claim this Badge with an account that has an onchain Coinbase Verification Attestation.",
    type: "Activity",
    category: "Based",
    partnerName: "Base",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 250,
    externalLink: "https://www.coinbase.com/onchain-verify",
  },
  {
    name: "Buildooor",
    nftId: "12",
    image: `${LINK_PREFIX}/12.png`,
    rewardImage: `${LINK_PREFIX}/12.png`,
    description: "Deploy a Contract on Base",
    fullDescription:
      "Claim this Badge with an account that has deployed a contract on Base that's at least 7 days old.",
    type: "Activity",
    category: "Based",
    partnerName: "Base",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 250,
    externalLink: "https://www.base.org/builders",
  },
  {
    name: "You The One",
    nftId: "15",
    image: `${LINK_PREFIX}/15.png`,
    rewardImage: `${LINK_PREFIX}/15.png`,
    description: "Coinbase One Member Onchain Attestation",
    fullDescription:
      "Claim this Badge with an account that has a Coinbase One Membership.",
    type: "Activity",
    category: "Based",
    partnerName: "Base",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 100,
    externalLink: "https://www.coinbase.com/one",
  },
  {
    name: "Blue Chain Punks",
    nftId: "33",
    image: `${LINK_PREFIX}/33.png`,
    rewardImage: `${LINK_PREFIX}/33.png`,
    description: "Own a BasePunks NFT",
    fullDescription:
      "Claim this badge by holding a BasePunks NFT in your wallet.",
    type: "Activity",
    category: "NFT",
    partnerName: "BasePunks",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 100,
    externalLink: "https://opensea.io/collection/basedpunks",
  },
  // {
  //   name: "Society of Apes",
  //   nftId: "34",
  //   image: `${LINK_PREFIX}/34.png`,
  //   rewardImage: `${LINK_PREFIX}/34.png`,
  //   description: "Own an Ape Society NFT",
  //   fullDescription:
  //     "Claim this badge by holding an Ape Society NFT in your wallet.",
  //   type: "Activity",
  //   category: "NFT",
  //   partnerName: "Ape Society",
  //   minHydropoints: 1000,
  //   poolSize: 250000,
  //   maxSupply: 100,
  //   externalLink: "https://opensea.io/collection/t-a-s",
  // },
  {
    name: "OG Base Fren",
    nftId: "28",
    image: `${LINK_PREFIX}/28.png`,
    rewardImage: `${LINK_PREFIX}/28.png`,
    description: "Dominate on FrenPet",
    fullDescription:
      "Claim this badge by owning a FrenPet that was a top 1000 leaderboard member. Snapshot taken July 6th.",
    type: "Activity",
    category: "Gaming",
    partnerName: "Frenpet",
    minHydropoints: 1000,
    poolSize: 200000,
    maxSupply: 25,
    externalLink: "https://www.frenpet.xyz/",
  },
  {
    name: "Locked Mavia Hero",
    nftId: "29",
    image: `${LINK_PREFIX}/29.png`,
    rewardImage: `${LINK_PREFIX}/29.png`,
    description: "Max Lock your MAVIA",
    fullDescription:
      "Claim this badge by locking MAVIA for 12 months on their official staking service.",
    type: "Activity",
    category: "Gaming",
    partnerName: "Heroes of Mavia",
    minHydropoints: 1000,
    poolSize: 200000,
    maxSupply: 100,
    externalLink: "https://www.mavia.com/staking/mavia",
  },
  {
    name: "Tokiemaster",
    nftId: "16",
    image: `${LINK_PREFIX}/16.png`,
    rewardImage: `${LINK_PREFIX}/metrics/16.png`,
    description: "Top Tokiemon Rune Holder",
    fullDescription:
      "Claim this Badge with an account that is a top 100 Tokiemon Rune holder during the late June 2025 snapshot.",
    type: "Partner",
    category: "Gaming",
    partnerName: "Tokiemon",
    minHydropoints: 1000,
    metric: "Tokiemon Runes",
    externalLink: "https://tokiemon.io",
  },
  {
    name: "Top Cat",
    nftId: "24",
    image: `${LINK_PREFIX}/24.png`,
    rewardImage: `${LINK_PREFIX}/24.png`,
    description: "Leaderboard Rank on Cat Town",
    fullDescription:
      "Claim this badge by being a top 100 member of the Cat Town leaderboard. Snapshot taken July 6th.",
    type: "Partner",
    category: "Gaming",
    partnerName: "Cat Town",
    minHydropoints: 1000,
    metric: "Staked Kibble",
    externalLink: "https://cat.town/",
  },
  // {
  //   name: "It's a Me, Bario!",
  //   nftId: "25",
  //   image: `${LINK_PREFIX}/25.png`,
  //   rewardImage: `${LINK_PREFIX}/25.png`,
  //   description: "For Bario DMG-01 Holders",
  //   fullDescription:
  //     "Claim this badge by holding a Bario DMG-01 NFT in your wallet and being a lifelong Base gamer!",
  //   type: "Partner",
  //   category: "Gaming",
  //   partnerName: "Bario",
  //   minHydropoints: 1000,
  //   poolSize: 200000,
  //   maxSupply: 50,
  //   externalLink: "https://baes.so/",
  // },
  {
    name: "The Dropzone",
    nftId: "26",
    image: `${LINK_PREFIX}/26.png`,
    rewardImage: `${LINK_PREFIX}/26.png`,
    description: "Metacade Dropzone OE NFT",
    fullDescription:
      "Claim this badge by holding Metacade's Dropzone OE NFT in your wallet.",
    type: "Partner",
    category: "Gaming",
    partnerName: "Metacade",
    minHydropoints: 1000,
    poolSize: 200000,
    maxSupply: 50,
    externalLink: "https://www.metacade.co/dropzone",
  },
  // {
  //   name: "BMX Staker",
  //   nftId: "18",
  //   image: `${LINK_PREFIX}/18.png`,
  //   rewardImage: `${LINK_PREFIX}/18.png`,
  //   description: "Stake Your BMX on Base",
  //   fullDescription: "Claim this badge by staking BMX tokens on bmx.trade",
  //   type: "Partner",
  //   category: "DeFi",
  //   partnerName: "BMX",
  //   minHydropoints: 1000,
  //   poolSize: 500000,
  //   maxSupply: 250,
  //   externalLink: "https://bmx.trade",
  // },
  {
    name: "Apes Together Strong",
    nftId: "22",
    image: `${LINK_PREFIX}/22.png`,
    rewardImage: `${LINK_PREFIX}/22.png`,
    description: "Buy a Bond on Base",
    fullDescription: "Claim this badge by buying a bond from ApeBond on Base.",
    type: "Partner",
    category: "DeFi",
    partnerName: "ApeBond",
    minHydropoints: 1000,
    poolSize: 1000000,
    maxSupply: 250,
    externalLink: "https://ape.bond",
  },
  {
    name: "Inbetween Alien",
    nftId: "19",
    image: `${LINK_PREFIX}/19.png`,
    rewardImage: `${LINK_PREFIX}/19.png`,
    description: "Escrow on Alien Base",
    fullDescription: "Claim this badge by escrowing 100+ ALB on Alien Base.",
    type: "Activity",
    category: "DeFi",
    partnerName: "Alien Base",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 200,
    externalLink: "https://alienbase.xyz",
  },
  {
    name: "YO-YO",
    nftId: "20",
    image: `${LINK_PREFIX}/20.png`,
    rewardImage: `${LINK_PREFIX}/20.png`,
    description: "Be a YO Leaderboard Member",
    fullDescription:
      "Claim this badge by being a top 2000 member of the late-June YO leaderboard snapshot.",
    type: "Activity",
    category: "DeFi",
    partnerName: "YO",
    minHydropoints: 1000,
    poolSize: 100000,
    maxSupply: 50,
    metric: "YO Leaderboard",
    externalLink: "https://yo.xyz",
  },
  {
    name: "Well, well, well",
    nftId: "21",
    image: `${LINK_PREFIX}/21.png`,
    rewardImage: `${LINK_PREFIX}/21.png`,
    description: "Stake WELL on Moonwell",
    fullDescription:
      "Claim this badge by holding 250+ staked WELL on Moonwell on Base.",
    type: "Activity",
    category: "DeFi",
    partnerName: "Moonwell",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 200,
    externalLink: "https://moonwell.fi",
  },
  {
    name: "That's All, Folks",
    nftId: "23",
    image: `${LINK_PREFIX}/23.png`,
    rewardImage: `${LINK_PREFIX}/23.png`,
    description: "Own a Folks Finance Founders Pass",
    fullDescription:
      "Claim this badge by holding the Folks Finance Founders Pass on Base.",
    type: "Partner",
    category: "DeFi",
    partnerName: "Folks Finance",
    minHydropoints: 1000,
    poolSize: 100000,
    maxSupply: 50,
    externalLink: "https://folks.finance/",
  },
  {
    name: "Purple App",
    nftId: "6",
    image: `${LINK_PREFIX}/6.png`,
    rewardImage: `${LINK_PREFIX}/6.png`,
    description: "For the Mini App Users",
    fullDescription:
      "Create a Farcaster account and claim this badge with a connected wallet.",
    type: "Activity",
    category: "Social",
    partnerName: "Farcaster",
    minHydropoints: 100,
    poolSize: 500000,
    maxSupply: 1000,
    externalLink: "https://farcaster.xyz",
  },
  {
    name: "Content Coiner",
    nftId: "13",
    image: `${LINK_PREFIX}/13.png`,
    rewardImage: `${LINK_PREFIX}/13.png`,
    description: "Coin Content on Zora Uni V4",
    fullDescription:
      "Claim this Badge with an account that has coined content on Zora.",
    type: "Activity",
    category: "Based",
    partnerName: "Base",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 250,
    externalLink: "https://zora.co",
  },
  {
    name: "Mother Flauncher",
    nftId: "14",
    image: `${LINK_PREFIX}/14.png`,
    rewardImage: `${LINK_PREFIX}/14.png`,
    description: "Flaunch a Token on Base",
    fullDescription:
      "Claim this Badge with an account that has flaunched a token.",
    type: "Partner",
    category: "Memes",
    partnerName: "Base",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 250,
    externalLink: "https://flaunch.gg",
  },
  {
    name: "Caster Pro",
    nftId: "7",
    image: `${LINK_PREFIX}/7.png`,
    rewardImage: `${LINK_PREFIX}/7.png`,
    description: "Become a Farcaster Pro Subscriber",
    fullDescription:
      "Claim this badge with an account that has registered as a Farcaster Pro user.",
    type: "Activity",
    category: "Social",
    partnerName: "Farcaster",
    minHydropoints: 100,
    poolSize: 150000,
    maxSupply: 100,
    externalLink: "https://farcaster.xyz",
  },
  {
    name: "Hydrex O.G.",
    nftId: "0",
    image: `${LINK_PREFIX}/0.png`,
    rewardImage: `${LINK_PREFIX}/0.png`,
    description: "For Hydrex Day 1 supporters",
    fullDescription:
      "A Badge designed for all the Hydrex O.G.'s and day 1 supporters. Claimable by any account. First come first serve.",
    type: "Activity",
    category: "Tier",
    partnerName: "Hydrex",
    minHydropoints: 0,
    poolSize: 1000000,
    maxSupply: 10000,
  },
  {
    name: "BASED DAO",
    nftId: "30",
    image: `${LINK_PREFIX}/30.png`,
    rewardImage: `${LINK_PREFIX}/30.png`,
    description: "Own a Based Nouns DAO NFT",
    fullDescription:
      "Claim this badge by holding a Based Nouns DAO NFT in your wallet.",
    type: "Partner",
    category: "NFT",
    partnerName: "BasedNouns",
    minHydropoints: 1000,
    poolSize: 400000,
    maxSupply: 150,
    externalLink: "https://opensea.io/collection/based-dao",
  },
  {
    name: "De-Regenerates",
    nftId: "31",
    image: `${LINK_PREFIX}/31.png`,
    rewardImage: `${LINK_PREFIX}/31.png`,
    description: "Own a Regenerates NFT",
    fullDescription:
      "Claim this badge by holding a Regenerates NFT in your wallet.",
    type: "Partner",
    category: "NFT",
    partnerName: "Regenerates",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 100,
    externalLink: "https://opensea.io/collection/re-gens",
  },
  {
    name: "OK COMPUTER",
    nftId: "32",
    image: `${LINK_PREFIX}/32.png`,
    rewardImage: `${LINK_PREFIX}/32.png`,
    description: "Own an OK Computer NFT",
    fullDescription:
      "Claim this badge by holding an OK Computer NFT in your wallet.",
    type: "Activity",
    category: "NFT",
    partnerName: "OKComputer",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 100,
    externalLink: "https://opensea.io/collection/okcomputers",
  },
  {
    name: "NFToshi",
    nftId: "35",
    image: `${LINK_PREFIX}/35.png`,
    rewardImage: `${LINK_PREFIX}/35.png`,
    description: "Own an NFToshi",
    fullDescription: "Claim this badge by holding an NFToshi in your wallet.",
    type: "Activity",
    category: "NFT",
    partnerName: "NFToshi",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 100,
    externalLink: "https://opensea.io/collection/nftoshis-official",
  },
  {
    name: "Basenji Boi",
    nftId: "36",
    image: `${LINK_PREFIX}/36.png`,
    rewardImage: `${LINK_PREFIX}/36.png`,
    description: "Own a Basenji NFT",
    fullDescription:
      "Claim this badge by holding a Basenji NFT in your wallet.",
    type: "Activity",
    category: "NFT",
    partnerName: "Basenji",
    minHydropoints: 1000,
    poolSize: 250000,
    maxSupply: 100,
    externalLink: "https://opensea.io/collection/basenjinfts",
  },
  {
    name: "B3 Player",
    nftId: "27",
    image: `${LINK_PREFIX}/27.png`,
    rewardImage: `${LINK_PREFIX}/27.png`,
    description: "Stake B3 on Base",
    fullDescription:
      "Claim this badge by staking at least 100 B3 on B3's Stake to Win platform.",
    type: "Activity",
    category: "Gaming",
    partnerName: "B3",
    minHydropoints: 1000,
    poolSize: 200000,
    maxSupply: 100,
    externalLink: "https://stake.b3.fun/",
  },
];

export { Badges };
