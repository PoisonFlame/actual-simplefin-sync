const simpleFIN = require('./simpleFIN')
const api = require('@actual-app/api');
const actualInjected = require('@actual-app/api/dist/injected');

let _accessKey
let _linkedAccounts
let _startDate
let _serverUrl
let _serverPassword
let _budgetId
let _budgetEncryption
let _sendNotes
let _discordWebhookUrl
let _discordWebhookEnabled

async function sync () {

  let combinedMsg = '';
  let errors = '';
  
  const { mkdir } = require('fs').promises;

  budgetspath = __dirname+'/budgets'

  try {
    await mkdir(budgetspath);
  } catch (e) {}


  await api.init({ 
    dataDir: budgetspath,
    serverURL: _serverUrl,
    password: _serverPassword,
  });

  console.log('Downloading budget')
  try {
    await api.downloadBudget(_budgetId,  {password: _budgetEncryption});
  } catch (e) {
    console.log(e.message)
    throw e
  }
  console.log('Budget downloaded')

  console.log('Getting all accounts and transactions from ActualBudget')
  const allAccounts = await api.getAccounts()
  console.log('Getting all transactions from SimpleFIN')
  const allTrans = await simpleFIN.getTransactions(_accessKey, _startDate)
  const accountErrors = allTrans.errors
  errors += `${accountErrors}\n`

  let header1 = '_____________________________________________________'
  let header2 = '|          Account          |   Added   |  Updated  |'
  let header3 = '+---------------------------+-----------+-----------+'
  console.log(header1)
  console.log(header2)
  console.log(header3)
  combinedMsg += `${header1}\n${header2}\n${header3}\n`
  for (const simpleFINAccountId in _linkedAccounts) {
    const accountId = _linkedAccounts[simpleFINAccountId]
    const transactions = allTrans.accounts.find(f => f.id === simpleFINAccountId).transactions
      .map(m => {
        return {
          account: accountId,
          date: new Date(m.posted * 1000).toISOString().split('T')[0],
          amount: parseInt(m.amount.replace('.', '')),
          payee_name: m.payee,
          notes: m.description,
          imported_payee: m.payee,
          imported_id: m.id
        }
      })
    try {

      const importedTransactions = await api.importTransactions(accountId, transactions)
      const accountName = allAccounts.find(f => f.id === accountId).name
      const accountStatus = `| ${accountName.padEnd(25, ' ')} | ${importedTransactions.added.length.toString().padStart(9, ' ')} | ${importedTransactions.updated.length.toString().padStart(9, ' ')} |`
      console.log(accountStatus)
      combinedMsg += `${accountStatus}\n`
      
      if( _sendNotes == 'yes' ) {
      
        const balanceDate = new Date(allTrans.accounts.find(f => f.id == simpleFINAccountId)['balance-date'] * 1000);
        const formatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        });

        const balance = allTrans.accounts.find(f => f.id == simpleFINAccountId).balance
        const accountNote = "Transactions synced at " + balanceDate.toLocaleString() + " with balance " + formatter.format(balance);
        const noteId = 'account-' + accountId;
        await actualInjected.send('notes-save', { id: noteId, note: accountNote });
      }
    } catch (ex) {
      console.log(ex)
      errors += `${ex.message}\n`
      return [combinedMsg, errors]
      throw ex
    }
  }
  const footer = '¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯'
  console.log(footer)
  combinedMsg += `${footer}\n`
  console.log('Re-downloading budget to force sync.')
  try {
    await api.downloadBudget(_budgetId,  {password:_budgetEncryption});
  } catch (e) {
    console.log(e.message)
    errors += `${e.message}\n`
    return [combinedMsg, errors]
    throw e
  }
  await api.shutdown()
  return [combinedMsg, errors]
  
}

async function run (accessKey, budgetId, budgetEncryption, linkedAccounts, startDate, serverUrl, serverPassword, sendNotes, discordWebhookEnabled, discordWebhookUrl) {
  _accessKey = accessKey
  _linkedAccounts = linkedAccounts
  _startDate = startDate
  _serverUrl = serverUrl
  _serverPassword = serverPassword
  _budgetId = budgetId
  _budgetEncryption = budgetEncryption
  _sendNotes = sendNotes
  _discordWebhookUrl = discordWebhookUrl
  _discordWebhookEnabled = discordWebhookEnabled

  if(!_serverUrl || !_serverPassword) {
    throw new Error('Server URL or password not set')
  } else {
    console.log('Server information set')
  }
  console.log(`Budget ID: ${budgetId}`)

  const [syncMessage,syncErr] = await sync()

  if(discordWebhookEnabled === "yes"){
 
    let dataToSend = {
      "embeds": [
        {
          "title": `Sync Status for ${new Date(new Date().toLocaleString('en', {timeZone: 'America/Toronto'})).toJSON().slice(0, 10).toString()}: %1`,
          "color": 5814783,
          "fields" : [
            {
              name: "",
              value: "```" + syncMessage + "```"
            }
          ]
        }
      ]
    }

     if(syncErr) {
      // Return error to discord hook
      dataToSend = dataToSend.embeds[0].title.replace("%1", "Error")
      dataToSend.embeds[0].fields[0].value = "```" + errors + "```"
    }else{
      // Return status ok to discord webhook
      dataToSend = dataToSend.embeds[0].title.replace("%1", "OK")
    }

    await fetch(discordWebhookUrl, {                             
        method: 'POST',                                          
        body: JSON.stringify(dataToSend),                        
        headers: {                                               
            'Content-type': 'application/json; charset=UTF-8',   
        },                                                       
    })                                                           
        .then((response) => response.json())                     
        .then((json) => console.log(json))                       
        .catch(error => {                                        
            console.log(error)                                   
        })
  }
}

module.exports = { run }
