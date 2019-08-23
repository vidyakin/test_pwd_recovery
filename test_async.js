// получение через промис
function getToken() {
    return new Promise( (resolve, reject) => {
        require('crypto').randomBytes(16, (err,buf) => resolve(buf.toString('hex'))) 
    })
}

// получение через асинк
async function getToken2() {  // асинхронная "обертка"
    return await new Promise((rs,rj) => { 
        require('crypto').randomBytes(16, 
            (err,buf) => {
                if (err) rj (err)
                else 
                    rs(buf.toString('hex')) // прокидываем в промис
            }
        ) 
    })        
}

// асинхронная обертка вызовов чтоб работал await
(async ()=>{
    // №1
    getToken()
        .then(x => {
            console.log('TOKEN 1 is:'+ x)
        })
    
    // №2
    let t = await getToken2()
    console.log('TOKEN 2 is:'+ t )
})()