


function getToken() {
    return new Promise( (resolve, reject) => {
        require('crypto').randomBytes(16, (err,buf) => resolve(buf.toString('hex'))) 
    })
}

async function getToken2() {
    return await new Promise((rs,rj) => {
        require('crypto').randomBytes(16, 
            (err,buf) => {
                if (err) rj(err)
                else 
                    rs(buf.toString('hex'))
            }
        ) 
    })
        
}

(async ()=>{

    getToken()
        .then(x => {
            console.log('TOKEN 1 is:'+ x)
        })

    let t = await getToken2()
    console.log('TOKEN 2 is:'+ t )
})()