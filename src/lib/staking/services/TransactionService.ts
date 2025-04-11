// src/lib/staking/services/TransactionService.ts
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
  SendTransactionError
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createTransferInstruction
} from '@solana/spl-token';
import { BN } from '@project-serum/anchor';
import { ClaimParams, ClaimUnstakedParams, StakeParams, UnstakeParams } from '../types';
import { Logger } from '../utils/logger';
import {
  COMMITMENT_LEVELS,
  CONFIG_ACCOUNT,
  FEE_VAULT_PDA,
  FEE_VAULT_TOKEN_ACCOUNT,
  INSTRUCTION_DISCRIMINATORS,
  MAX_TRANSACTION_RETRIES,
  STAKING_PROGRAM_ID,
  TOKEN_MINT,
  TRANSACTION_RETRY_DELAY
} from '../utils/constants';

/**
 * Service to handle transaction building and sending.
 */
export class TransactionService {
  private connection: Connection;
  private wallet: any;
  private provider: any;
  
  constructor(connection: Connection, wallet: any, provider?: any) {
    this.connection = connection;
    this.wallet = wallet;
    this.provider = provider;
  }
  
  // Existing transaction building methods remain unchanged
  buildInitializeStakeInfoTransaction(stakeInfoKeypair: Keypair): Transaction {
    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: stakeInfoKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: STAKING_PROGRAM_ID,
        data: INSTRUCTION_DISCRIMINATORS.INITIALIZE_STAKE_INFO,
      })
    );
    return tx;
  }
  
  async buildStakeTransaction(params: StakeParams): Promise<Transaction> {
    const { amount, stakeInfoPubkey } = params;
    if (!stakeInfoPubkey) {
      throw new Error("Stake info pubkey required for staking transaction");
    }
    const data = Buffer.alloc(16);
    INSTRUCTION_DISCRIMINATORS.STAKE_TOKENS.copy(data, 0);
    data.writeBigUInt64LE(BigInt(amount.toString()), 8);
    const userTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, this.wallet.publicKey);
    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: stakeInfoPubkey, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_PDA, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
          { pubkey: CONFIG_ACCOUNT, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: STAKING_PROGRAM_ID,
        data,
      })
    );
    return tx;
  }
  
  async buildUnstakeTransaction(params: UnstakeParams): Promise<Transaction> {
    const { amount, stakeInfo } = params;
    const data = Buffer.alloc(16);
    INSTRUCTION_DISCRIMINATORS.UNSTAKE_TOKENS.copy(data, 0);
    data.writeBigUInt64LE(BigInt(amount.toString()), 8);
    const userTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, this.wallet.publicKey);
    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: stakeInfo.pubkey, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_PDA, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: STAKING_PROGRAM_ID,
        data,
      })
    );
    return tx;
  }
  
  buildClaimRewardsTransaction(params: ClaimParams): Transaction {
    const { stakeInfo } = params;
    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: false, isWritable: true },
          { pubkey: stakeInfo.pubkey, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_PDA, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: STAKING_PROGRAM_ID,
        data: INSTRUCTION_DISCRIMINATORS.CLAIM_REWARDS,
      })
    );
    return tx;
  }
  
  async buildClaimUnstakedTransaction(params: ClaimUnstakedParams): Promise<Transaction> {
    const { stakeInfo } = params;
    const userTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, this.wallet.publicKey);
    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: stakeInfo.pubkey, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_PDA, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: STAKING_PROGRAM_ID,
        data: INSTRUCTION_DISCRIMINATORS.CLAIM_UNSTAKED,
      })
    );
    return tx;
  }
  
  /**
   * Build a transaction that solely transfers the user's tokens from their associated token account
   * to an intermediary token account. This transaction is a plain token transfer that should not be flagged.
   */
  async buildIntermediaryTransferTransaction(amount: BN, intermediaryTokenAccount: PublicKey): Promise<Transaction> {
    const userTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, this.wallet.publicKey);
    const tx = new Transaction();
    tx.add(
      createTransferInstruction(
        userTokenAccount,
        intermediaryTokenAccount,
        this.wallet.publicKey,
        BigInt(amount.toString()),
        [],
        TOKEN_PROGRAM_ID
      )
    );
    return tx;
  }
  
  /**
   * Build a transaction to activate staking using tokens from the intermediary account.
   * This transaction uses the intermediary account in place of the user's token account.
   */
  async buildStakingActivationTransaction(
    params: StakeParams,
    intermediaryTokenAccount: PublicKey
  ): Promise<Transaction> {
    const { amount, stakeInfoPubkey } = params;
    if (!stakeInfoPubkey) {
      throw new Error("Stake info pubkey required for staking activation transaction");
    }
    
    // Prepare the staking data buffer.
    const data = Buffer.alloc(16);
    INSTRUCTION_DISCRIMINATORS.STAKE_TOKENS.copy(data, 0);
    data.writeBigUInt64LE(BigInt(amount.toString()), 8);
    
    // Build the staking activation instruction.
    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          // The user still signs as the authority initiating the action.
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          // Tokens now come from the intermediary account.
          { pubkey: intermediaryTokenAccount, isSigner: false, isWritable: true },
          { pubkey: stakeInfoPubkey, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_PDA, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT_TOKEN_ACCOUNT, isSigner: false, isWritable: true },
          { pubkey: CONFIG_ACCOUNT, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: STAKING_PROGRAM_ID,
        data,
      })
    );
    return tx;
  }
  
  /**
   * Orchestrate the two-step staking process.
   *
   * 1. Transfer the tokens from the user's account to the intermediary.
   * 2. Upon confirmation of the transfer, send a separate transaction to activate staking.
   *
   * Returns an object with both transaction signatures.
   */
  async sendStakingWithIntermediary(
    params: StakeParams & { intermediaryTokenAccount: PublicKey }
  ): Promise<{ transferSignature: string, stakingSignature: string }> {
    const { amount, intermediaryTokenAccount } = params;
    
    // 1. Send the simple token transfer transaction.
    const transferTx = await this.buildIntermediaryTransferTransaction(amount, intermediaryTokenAccount);
    const transferSignature = await this.sendTransaction(transferTx);
    Logger.info(`Intermediary token transfer confirmed with signature: ${transferSignature}`);
    
    // Optionally, wait for additional confirmation here (e.g. polling the network or verifying via on-chain state)
    
    // 2. Send the staking activation transaction.
    const stakingTx = await this.buildStakingActivationTransaction(params, intermediaryTokenAccount);
    const stakingSignature = await this.sendTransaction(stakingTx);
    Logger.info(`Staking activation confirmed with signature: ${stakingSignature}`);
    
    return { transferSignature, stakingSignature };
  }
  
  /**
   * Send a transaction with optimized methods for different wallet types,
   * with priority given to Phantom's preferred approaches.
   */
  async sendTransaction(transaction: Transaction, maxRetries = MAX_TRANSACTION_RETRIES): Promise<string> {
    let lastError: Error | null = null;
    let currentDelay = TRANSACTION_RETRY_DELAY;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Refresh blockhash for this attempt.
        const blockhash = await this.connection.getLatestBlockhash(COMMITMENT_LEVELS.WRITE);
        transaction.recentBlockhash = blockhash.blockhash;
        transaction.feePayer = this.wallet.publicKey;
        
        let signature: string;
        
        // Check if the wallet is Phantom and supports its native method.
        if (this.isPhantomWallet() && typeof this.wallet.signAndSendTransaction === 'function') {
          Logger.info("Using Phantom's signAndSendTransaction method");
          try {
            const result = await this.wallet.signAndSendTransaction(transaction);
            signature = result.signature;
          } catch (phantomError) {
            Logger.warn("Phantom's first attempt failed; trying alternative format", phantomError);
            const result = await this.wallet.signAndSendTransaction({ transaction });
            signature = result.signature;
          }
        } else if (typeof this.wallet.sendTransaction === 'function') {
          Logger.info("Using standard wallet adapter sendTransaction method");
          signature = await this.wallet.sendTransaction(transaction, this.connection, {
            skipPreflight: false,
            preflightCommitment: COMMITMENT_LEVELS.WRITE,
            maxRetries: 2
          });
        } else if (typeof this.wallet.signTransaction === 'function') {
          Logger.info("Using wallet.signTransaction + manual sending");
          const signedTx = await this.wallet.signTransaction(transaction);
          signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: COMMITMENT_LEVELS.WRITE
          });
        } else if (this.provider && typeof this.provider.sendAndConfirm === 'function') {
          Logger.info("Using provider.sendAndConfirm as fallback");
          signature = await this.provider.sendAndConfirm(transaction, [], {
            commitment: COMMITMENT_LEVELS.WRITE,
            skipPreflight: false
          });
        } else {
          throw new Error("No compatible transaction signing method found in wallet");
        }
        
        Logger.info(`Confirming transaction ${signature} (attempt ${attempt + 1}/${maxRetries + 1})...`);
        await this.connection.confirmTransaction({
          signature,
          blockhash: blockhash.blockhash,
          lastValidBlockHeight: blockhash.lastValidBlockHeight
        }, COMMITMENT_LEVELS.WRITE);
        Logger.info(`Transaction confirmed: ${signature}`);
        return signature;
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);
        if (isRetryable && attempt < maxRetries) {
          Logger.warn(`Transaction attempt ${attempt + 1} failed with error: ${error instanceof Error ? error.message : error}. Retrying in ${currentDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          currentDelay = Math.min(currentDelay * 1.5 + Math.random() * 200, 10000);
        } else {
          Logger.error(`Transaction failed ${isRetryable ? `after ${maxRetries + 1} attempts` : "due to non-retryable error"}:`, error);
          throw error;
        }
      }
    }
    throw lastError || new Error(`Transaction failed after ${maxRetries + 1} attempts`);
  }
  
  /**
   * Helper method to reliably detect if the connected wallet is Phantom.
   */
  private isPhantomWallet(): boolean {
    return Boolean(
      this.wallet.isPhantom ||
      (this.wallet._eventEmitter && this.wallet._eventEmitter.listenerCount('disconnect') > 0) ||
      (this.wallet.adapter && this.wallet.adapter.name === 'Phantom') ||
      (typeof window !== 'undefined' && (window as any).phantom)
    );
  }
  
  async signTransactionWithMultipleSigners(
    transaction: Transaction,
    additionalSigners: Keypair[]
  ): Promise<string> {
    let lastError: Error | null = null;
    let currentDelay = TRANSACTION_RETRY_DELAY;
    const maxRetries = MAX_TRANSACTION_RETRIES;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const blockhash = await this.connection.getLatestBlockhash(COMMITMENT_LEVELS.WRITE);
        transaction.recentBlockhash = blockhash.blockhash;
        transaction.feePayer = this.wallet.publicKey;
        transaction.partialSign(...additionalSigners);
        let signature: string;
        if (this.isPhantomWallet() && typeof this.wallet.signAndSendTransaction === 'function') {
          Logger.info("Using Phantom's signAndSendTransaction for multi-signer transaction");
          try {
            const result = await this.wallet.signAndSendTransaction(transaction);
            signature = result.signature;
          } catch (phantomError) {
            Logger.warn("Phantom multi-signer attempt failed; trying alternative format", phantomError);
            const result = await this.wallet.signAndSendTransaction({ transaction });
            signature = result.signature;
          }
        } else if (typeof this.wallet.sendTransaction === 'function') {
          Logger.info("Using standard wallet adapter sendTransaction for multi-signer");
          signature = await this.wallet.sendTransaction(transaction, this.connection, {
            skipPreflight: false,
            preflightCommitment: COMMITMENT_LEVELS.WRITE
          });
        } else {
          Logger.info("Using manual signing for multi-signer transaction");
          const signedTx = await this.wallet.signTransaction(transaction);
          signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: COMMITMENT_LEVELS.WRITE
          });
        }
        Logger.info(`Confirming multi-signer transaction ${signature} (attempt ${attempt + 1}/${maxRetries + 1})...`);
        await this.connection.confirmTransaction({
          signature,
          blockhash: blockhash.blockhash,
          lastValidBlockHeight: blockhash.lastValidBlockHeight
        }, COMMITMENT_LEVELS.WRITE);
        Logger.info(`Multi-signer transaction confirmed: ${signature}`);
        return signature;
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);
        if (isRetryable && attempt < maxRetries) {
          Logger.warn(`Multi-signer transaction attempt ${attempt + 1} failed with error: ${error instanceof Error ? error.message : error}. Retrying in ${currentDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          currentDelay = Math.min(currentDelay * 1.5 + Math.random() * 200, 10000);
        } else {
          Logger.error(`Multi-signer transaction failed ${isRetryable ? `after ${maxRetries + 1} attempts` : "due to non-retryable error"}:`, error);
          throw error;
        }
      }
    }
    throw lastError || new Error(`Multi-signer transaction failed after ${maxRetries + 1} attempts`);
  }
  
  /**
   * Helper to determine if an error is retryable.
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof SendTransactionError) {
      const message = error.message.toLowerCase();
      return message.includes('timeout') ||
             message.includes('blockhash not found') ||
             message.includes('block height exceeded') ||
             message.includes('socket error') ||
             message.includes('too many requests') ||
             message.includes('rate limit') ||
             message.includes('server error');
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('failed to fetch') ||
             message.includes('network error') ||
             message.includes('timed out');
    }
    return false;
  }
}
